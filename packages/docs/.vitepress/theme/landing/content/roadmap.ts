export interface RoadmapFeature {
  title: string
  detail: string
}

export interface RoadmapEntry {
  title: string
  detail?: string
  /** Present on the one entry the page presents as a feature block of its own. */
  features?: RoadmapFeature[]
}

export interface RoadmapStage {
  label: string
  /** In-progress stages get a filled marker. */
  current?: boolean
  entries: RoadmapEntry[]
}

/**
 * The landing page's short view of `development/roadmap.md`. "Now" lists work with open pull
 * requests; keep it in step with that document's "In development" section.
 */
export const ROADMAP: RoadmapStage[] = [
  {
    label: 'Now',
    current: true,
    entries: [
      {
        title: 'AI agents as collaborators',
        detail: 'See agents on the canvas like any other participant, and follow what they do.'
      },
      {
        title: 'Revert, regenerate, and edit AI turns',
        detail: 'With each tool call showing what it changed.'
      },
      { title: 'Live design checks', detail: 'A Lint panel with canvas markers and fixes.' },
      { title: 'Code linked to canvas layers', detail: 'Selection and edits sync both ways.' },
      { title: 'Visual diff and patch', detail: 'In the app, for agents, and as openpencil diff.' }
    ]
  },
  {
    label: 'Next',
    entries: [
      {
        title: 'Self-hosted OpenPencil',
        detail:
          'The whole workspace inside your own network: sync, sharing, comments, and team libraries without sending a file to anyone else.',
        features: [
          { title: 'Your storage', detail: 'Documents stay in your bucket, in your region.' },
          {
            title: 'Your identity',
            detail: 'Sign-in through your OIDC or SSO provider, with roles.'
          },
          {
            title: 'Your network',
            detail: 'A collaboration relay that works behind your firewall.'
          },
          {
            title: 'Your operations',
            detail: 'Guided deployment, upgrades, backups, and retention.'
          }
        ]
      },
      { title: 'Version history', detail: 'Automatic snapshots, named checkpoints, and restore.' },
      {
        title: 'Optional OpenPencil Cloud',
        detail: 'Hosted sync and sharing for teams that want it. Never required.'
      }
    ]
  },
  {
    label: 'Later',
    entries: [
      { title: 'Governed design systems', detail: 'Propose, review, publish, and migrate.' },
      { title: 'Embeddable editor', detail: 'Put the editor on this page into your own product.' }
    ]
  }
]
