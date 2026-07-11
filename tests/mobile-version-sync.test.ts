import { readFileSync } from 'node:fs'

import {
  describe,
  expect,
  it,
} from 'vitest'

import appConfig from '../apps/mobile/app.json'

const xcodeProjectPath = new URL('../apps/mobile/ios/MeteorVoice.xcodeproj/project.pbxproj', import.meta.url)

describe('mobile native version metadata', () => {
  it('keeps every Xcode configuration aligned with the Expo app version and build number', () => {
    const project = readFileSync(xcodeProjectPath, 'utf8')
    const marketingVersions = [...project.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map(match => match[1])
    const buildNumbers = [...project.matchAll(/CURRENT_PROJECT_VERSION = ([^;]+);/g)].map(match => match[1])

    expect(marketingVersions.length).toBeGreaterThan(0)
    expect(buildNumbers.length).toBeGreaterThan(0)
    expect(new Set(marketingVersions)).toEqual(new Set([appConfig.expo.version]))
    expect(new Set(buildNumbers)).toEqual(new Set([appConfig.expo.ios.buildNumber]))
  })
})
