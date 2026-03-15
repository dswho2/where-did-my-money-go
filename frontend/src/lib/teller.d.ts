// Type declarations for the Teller Connect JS SDK loaded via CDN

interface TellerConnectEnrollment {
  accessToken: string
  user: { id: string }
  enrollment: {
    id: string
    institution: { name: string }
  }
}

interface TellerConnectOptions {
  applicationId: string
  onSuccess: (enrollment: TellerConnectEnrollment) => void
  onExit?: () => void
  onFailure?: (error: unknown) => void
}

interface TellerConnectInstance {
  open: () => void
}

declare const TellerConnect: {
  setup: (options: TellerConnectOptions) => TellerConnectInstance
}
