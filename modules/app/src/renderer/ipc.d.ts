interface Window {
  ipc: {
    promptYGOPROPathSelect(): Promise<string>

    queryCardInfo(code: number): Promise<
      import('@picky/shared').YGOPROCardInfo | undefined
    >

    queryCardInfoSync(code: number): import('@picky/shared').YGOPROCardInfo | undefined

    randomAvatarCard(tags: {
      includes:  import('@picky/shared').CTypeEnums[]
      excludes?: import('@picky/shared').CTypeEnums[]
    }): Promise<import('@picky/shared').YGOPROCardInfo>

    updateYGOPROPath(path: string): Promise<void>
    writeClipboard(path: string): Promise<void>
    startYGOPRO(args: {
      draft_id: string
      server:   string // host:port
      passcode: string
      deck:     number[]
    }): Promise<void>
  }
}
