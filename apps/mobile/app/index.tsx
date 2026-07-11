/**
 * Root entry route — always open the practice session tab.
 */
import { Redirect } from 'expo-router'

export default function Index() {
  return <Redirect href="/(tabs)/session" />
}
