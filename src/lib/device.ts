export interface DeviceFingerprint {
  userAgent: string
  platform: string
  timezone: string
  language: string
  screenResolution: string
  uuid: string
}

export function generateDeviceFingerprint(): DeviceFingerprint {
  const uuid = getOrCreateDeviceUUID()
  
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: navigator.language,
    screenResolution: `${window.screen.width}x${window.screen.height}`,
    uuid,
  }
}

export function getOrCreateDeviceUUID(): string {
  const key = 'device_uuid'
  let uuid = localStorage.getItem(key)
  
  if (!uuid) {
    uuid = crypto.randomUUID()
    localStorage.setItem(key, uuid)
  }
  
  return uuid
}

export function checkEmulatorHeuristics(): {
  isLikelyEmulator: boolean
  flags: string[]
} {
  const flags: string[] = []
  
  // Check for common emulator indicators
  if (navigator.webdriver) {
    flags.push('webdriver_detected')
  }
  
  if (navigator.maxTouchPoints === 0 && 'ontouchstart' in window) {
    flags.push('suspicious_touch_capability')
  }
  
  return {
    isLikelyEmulator: flags.length > 0,
    flags,
  }
}
