#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))

const config = {
  repo: 'JunchenMeteor/MeteorVoice',
  projectName: 'MeteorVoice',
  branchPrefix: 'dev/release/',
  issuePrefix: '[Feature]',
  issueLabel: 'enhancement',
  mobileAppConfig: 'apps/mobile/app.json',
  mobileXcodeProject: 'apps/mobile/ios/MeteorVoice.xcodeproj/project.pbxproj',
  versionFiles: [
    'package.json',
    'apps/web/package.json',
    'apps/mobile/package.json',
    'apps/mobile/app.json',
    'package-lock.json',
  ],
  releaseDoc: (version) => `docs/releases/v${version}.md`,
  validation: ['npm test'],
  releaseUrls: ['https://meteorvoice.jcmeteor.com/', 'https://mv-pre.jcmeteor.com/'],
  deployWorkflow: 'Deploy Tencent Docker',
}

const args = process.argv.slice(2)
const command = args[0] ?? 'help'
const options = parseOptions(args.slice(1))

if (command === 'help' || options.help) {
  printHelp()
  process.exit(command === 'help' ? 0 : 1)
}

const version = normalizeVersion(options.version)
const tag = `v${version}`
const prepareTitle = `[Feature] Prepare ${tag} release`
const releaseTitle = `Release ${tag}`
const dryRun = options.dryRun === true

switch (command) {
  case 'full':
    await fullRelease()
    break
  case 'prepare':
    await prepareRelease()
    break
  case 'promote':
    await promoteRelease()
    break
  case 'verify':
    await verifyRelease()
    break
  default:
    fail(`Unknown command: ${command}`)
}

async function fullRelease() {
  await prepareRelease()
  await promoteRelease()
  await verifyRelease()
}

async function prepareRelease() {
  ensureTooling()
  ensureCleanWorktree()
  fetchBase()
  ensureTagDoesNotExist(tag)

  if (mainAlreadyPrepared(version)) {
    log(`main already contains ${tag}; skipping preparation PR`)
    return
  }

  const issue = createOrFindIssue(prepareTitle, issueBody('Prepare release version files and release notes.'))
  const branch = `${config.branchPrefix}${tag.replaceAll('.', '-')}`

  run('git', ['checkout', '-B', branch, 'origin/main'])
  updateVersionFiles(version)
  writeReleaseDoc(version)

  run('git', ['add', ...config.versionFiles.filter(exists), config.mobileXcodeProject, config.releaseDoc(version)])
  run('git', ['commit', '-m', `Prepare ${tag} release`])
  run('git', ['push', '-u', 'origin', branch])

  const pr = createOrFindPr(prepareTitle, branch, 'main', prBody(issue.number, 'Prepare the release version files and release notes.'))
  waitForPrChecks(pr.number)
  mergePr(pr.number, true)
  log(`Prepared ${tag} on main through PR #${pr.number}`)
}

async function promoteRelease() {
  ensureTooling()
  fetchBase()
  ensureTagDoesNotExist(tag)

  const issue = createOrFindIssue(releaseTitle, issueBody('Promote main to release and publish the GitHub Release.'))
  const pr = createOrFindPr(releaseTitle, 'main', 'release', prBody(issue.number, 'Promote main to the protected production release branch.'))

  waitForPrChecks(pr.number)
  const mergeCommit = mergePr(pr.number, false)
  waitForDeploy('release', mergeCommit)
  createGithubRelease(tag, mergeCommit)
  closeIssue(issue.number)
  log(`Released ${tag}: https://github.com/${config.repo}/releases/tag/${tag}`)
}

async function verifyRelease() {
  for (const url of config.releaseUrls) {
    run('curl', ['-I', '--max-time', '15', url])
  }
}

function parseOptions(rawArgs) {
  const parsed = {}
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index]
    if (!arg.startsWith('--')) continue
    const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase())
    const next = rawArgs[index + 1]
    if (!next || next.startsWith('--')) {
      parsed[key] = true
    } else {
      parsed[key] = next
      index += 1
    }
  }
  return parsed
}

function normalizeVersion(value) {
  if (!value || typeof value !== 'string') {
    fail('Missing --version, for example: --version 1.3.1')
  }
  const normalized = value.replace(/^v/, '')
  if (!/^\d+\.\d+\.\d+$/.test(normalized)) {
    fail(`Invalid version "${value}". Use semver like 1.3.1.`)
  }
  return normalized
}

function ensureTooling() {
  run('git', ['--version'])
  run('gh', ['--version'])
  run('curl', ['--version'])
  run('git', ['config', 'user.name', 'github-actions[bot]'], { allowFail: true })
  run('git', ['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com'], { allowFail: true })
}

function ensureCleanWorktree() {
  const status = capture('git', ['status', '--porcelain'])
  if (status.trim()) fail(`Worktree is not clean:\n${status}`)
}

function fetchBase() {
  run('git', ['fetch', 'origin', 'main', 'release', '--tags'])
}

function ensureTagDoesNotExist(tagName) {
  const existing = capture('git', ['tag', '--list', tagName]).trim()
  if (existing) fail(`Tag ${tagName} already exists.`)
}

function mainAlreadyPrepared(targetVersion) {
  run('git', ['checkout', 'origin/main'])
  return config.versionFiles
    .filter((file) => file.endsWith('package.json'))
    .every((file) => readJson(file).version === targetVersion) &&
    readJson(config.mobileAppConfig).expo?.version === targetVersion &&
    xcodeProjectAlreadyPrepared(targetVersion, readJson(config.mobileAppConfig).expo?.ios?.buildNumber) &&
    existsSync(config.releaseDoc(targetVersion))
}

function updateVersionFiles(targetVersion) {
  const mobileBuildNumber = nextMobileBuildNumber(readJson(config.mobileAppConfig))
  for (const file of config.versionFiles) {
    if (!existsSync(file)) continue
    const json = readJson(file)
    if (file === config.mobileAppConfig) {
      json.expo.version = targetVersion
      json.expo.ios.buildNumber = String(mobileBuildNumber)
      json.expo.android.versionCode = mobileBuildNumber
    } else if (file.endsWith('package-lock.json')) {
      json.version = targetVersion
      if (json.packages?.['']) json.packages[''].version = targetVersion
      for (const packagePath of ['apps/web', 'apps/mobile']) {
        if (json.packages?.[packagePath]) json.packages[packagePath].version = targetVersion
      }
    } else {
      json.version = targetVersion
    }
    writeJson(file, json)
  }
  updateXcodeProjectVersion(targetVersion, mobileBuildNumber)
}

function xcodeProjectAlreadyPrepared(targetVersion, buildNumber) {
  if (!existsSync(config.mobileXcodeProject) || !buildNumber) return false
  const project = readFileSync(config.mobileXcodeProject, 'utf8')
  const marketingVersions = [...project.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map(match => match[1])
  const buildNumbers = [...project.matchAll(/CURRENT_PROJECT_VERSION = ([^;]+);/g)].map(match => match[1])
  return marketingVersions.length > 0 &&
    buildNumbers.length > 0 &&
    marketingVersions.every(value => value === targetVersion) &&
    buildNumbers.every(value => value === String(buildNumber))
}

function updateXcodeProjectVersion(targetVersion, buildNumber) {
  if (!existsSync(config.mobileXcodeProject)) return
  const project = readFileSync(config.mobileXcodeProject, 'utf8')
    .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${targetVersion};`)
    .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${buildNumber};`)
  writeFileSync(config.mobileXcodeProject, project)
}

function nextMobileBuildNumber(appConfig, now = new Date()) {
  const datePrefix = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
  ].join('')
  const datedBuildNumber = Number(`${datePrefix}01`)
  const currentBuildNumbers = [
    Number(appConfig.expo?.ios?.buildNumber),
    Number(appConfig.expo?.android?.versionCode),
  ].filter(Number.isFinite)
  return Math.max(datedBuildNumber, ...currentBuildNumbers.map(value => value + 1))
}

function writeReleaseDoc(targetVersion) {
  const file = config.releaseDoc(targetVersion)
  if (existsSync(file)) return
  const appConfig = readJson(config.mobileAppConfig)
  const iosBuildNumber = appConfig.expo?.ios?.buildNumber ?? 'unknown'
  const androidVersionCode = appConfig.expo?.android?.versionCode ?? 'unknown'
  writeFileSync(
    file,
    `# Release Notes

Release focus: production promotion for ${config.projectName} ${targetVersion}.

## Highlights

- Promoted validated main branch changes to the production release branch.
- Updated Web and mobile package versions to \`${targetVersion}\`.
- Published GitHub Release tag \`v${targetVersion}\`.

## Deployment

- Production branch: \`release\`
- Preview branch: \`main\`
- Production URL: \`https://meteorvoice.jcmeteor.com/\`
- Preview URL: \`https://mv-pre.jcmeteor.com/\`

## Versioning

- Web version: \`${targetVersion}\`
- Mobile version: \`${targetVersion}\`
- iOS build number: \`${iosBuildNumber}\`
- Android version code: \`${androidVersionCode}\`
- Release tag: \`v${targetVersion}\`

## Validation

\`\`\`bash
npm test
\`\`\`
`,
  )
}

function createOrFindIssue(title, body) {
  const existing = JSON.parse(capture('gh', ['issue', 'list', '--repo', config.repo, '--state', 'all', '--search', `${JSON.stringify(title)} in:title`, '--json', 'number,title,state,url', '--limit', '20']))
    .find((issue) => issue.title === title)
  if (existing) return existing

  if (dryRun) return { number: 0, title, url: 'dry-run' }
  const output = capture('gh', ['issue', 'create', '--repo', config.repo, '--title', title, '--body', body, '--label', config.issueLabel])
  return parseIssueUrl(output.trim())
}

function createOrFindPr(title, head, base, body) {
  const existing = JSON.parse(capture('gh', ['pr', 'list', '--repo', config.repo, '--state', 'open', '--head', head, '--base', base, '--json', 'number,title,url', '--limit', '20']))
    .find((pr) => pr.title === title)
  if (existing) return existing

  if (dryRun) return { number: 0, title, url: 'dry-run' }
  const output = capture('gh', ['pr', 'create', '--repo', config.repo, '--title', title, '--body', body, '--head', head, '--base', base])
  return parsePrUrl(output.trim())
}

function waitForPrChecks(number) {
  if (dryRun) return
  run('gh', ['pr', 'checks', String(number), '--repo', config.repo, '--watch'])
}

function mergePr(number, deleteBranch) {
  if (dryRun) return capture('git', ['rev-parse', 'origin/main']).trim()
  const args = ['pr', 'merge', String(number), '--repo', config.repo, '--merge']
  if (deleteBranch) args.push('--delete-branch')
  run('gh', args)
  const pr = JSON.parse(capture('gh', ['pr', 'view', String(number), '--repo', config.repo, '--json', 'mergeCommit']))
  return pr.mergeCommit?.oid ?? ''
}

function waitForDeploy(branch, headSha) {
  if (dryRun) return
  const startedAt = Date.now()
  for (;;) {
    const runs = JSON.parse(capture('gh', ['run', 'list', '--repo', config.repo, '--branch', branch, '--workflow', config.deployWorkflow, '--json', 'databaseId,status,conclusion,headSha,createdAt', '--limit', '10']))
    const runInfo = runs.find((item) => item.headSha === headSha)
    if (runInfo?.status === 'completed') {
      if (runInfo.conclusion !== 'success') fail(`${config.deployWorkflow} failed with conclusion: ${runInfo.conclusion}`)
      return
    }
    if (Date.now() - startedAt > 20 * 60 * 1000) fail(`Timed out waiting for ${config.deployWorkflow}`)
    log(`Waiting for ${config.deployWorkflow} on ${branch}...`)
    sleep(15_000)
  }
}

function createGithubRelease(tagName, target) {
  if (dryRun) return
  const existing = capture('gh', ['release', 'list', '--repo', config.repo, '--json', 'tagName', '--limit', '100'])
  if (JSON.parse(existing).some((release) => release.tagName === tagName)) return
  run('gh', ['release', 'create', tagName, '--repo', config.repo, '--target', target, '--title', tagName, '--notes-file', config.releaseDoc(version), '--latest'])
}

function closeIssue(number) {
  if (dryRun || number === 0) return
  const issue = JSON.parse(capture('gh', ['issue', 'view', String(number), '--repo', config.repo, '--json', 'state']))
  if (issue.state !== 'CLOSED') {
    run('gh', ['issue', 'close', String(number), '--repo', config.repo, '--comment', `Released ${tag}: https://github.com/${config.repo}/releases/tag/${tag}`])
  }
}

function issueBody(summary) {
  return `## Summary

${summary}

## Expected Behavior

The release is promoted from main to release through protected PR checks, deployed to Tencent production, and published as a GitHub Release.

## Proposed Changes

- Update release version files and release notes when needed.
- Promote main to release through a pull request.
- Wait for deployment validation before publishing the GitHub Release.

## Test Plan

- Automated Release Manager PR checks.
- Tencent release deployment workflow.
- Production URL verification.`
}

function prBody(issueNumber, summary) {
  return `## Summary

${summary}

## Test Plan

- Automated CI, build, CodeQL, and deployment checks.
- Release Manager verification.

Closes #${issueNumber}`
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

function exists(file) {
  return existsSync(file)
}

function parseIssueUrl(url) {
  const match = url.match(/issues\/(\d+)/)
  if (!match) fail(`Could not parse issue URL: ${url}`)
  return { number: Number(match[1]), url }
}

function parsePrUrl(url) {
  const match = url.match(/pull\/(\d+)/)
  if (!match) fail(`Could not parse PR URL: ${url}`)
  return { number: Number(match[1]), url }
}

function capture(commandName, commandArgs) {
  return run(commandName, commandArgs, { capture: true })
}

function run(commandName, commandArgs, options = {}) {
  const printable = `${commandName} ${commandArgs.join(' ')}`
  log(printable)
  if (dryRun && !options.capture && !['git', 'gh'].includes(commandName)) return ''
  try {
    return execFileSync(commandName, commandArgs, {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    })
  } catch (error) {
    if (options.allowFail) return ''
    const stderr = error.stderr?.toString?.() ?? ''
    fail(`${printable} failed${stderr ? `:\n${stderr}` : ''}`)
  }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function log(message) {
  console.log(`[release-manager] ${message}`)
}

function fail(message) {
  console.error(`[release-manager] ${message}`)
  process.exit(1)
}

function printHelp() {
  console.log(`Usage:
  node scripts/release-manager.mjs full --version 1.3.1
  node scripts/release-manager.mjs prepare --version 1.3.1
  node scripts/release-manager.mjs promote --version 1.3.1
  node scripts/release-manager.mjs verify --version 1.3.1`)
}
