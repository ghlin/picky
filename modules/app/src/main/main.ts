; (require)('core-js/stable')
; (require)('regenerator-runtime/runtime')

import { atoi10, CTypeEnums, defined, YGOPROCardInfo } from '@picky/shared'
import { spawn } from 'child_process'
import Conf from 'conf'
import { randomInt } from 'crypto'
import { app, BrowserWindow, clipboard, dialog, ipcMain, protocol } from 'electron'
import log from 'electron-log'
import { autoUpdater } from 'electron-updater'
import { existsSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'
import path from 'path'
import { loadCDB } from './db'
import { getAssetPath, resolveHtmlPath } from './util'

const storage = {
  ygoroot: '',
  dict:    new Map<number, YGOPROCardInfo>(),
  list:    [] as YGOPROCardInfo[]
}

async function handleYGOPROPathUpdate(rootdir: string) {
  log.info(`handleYGOPROPathUpdate: ${storage.ygoroot || '*'} -> ${rootdir}`)
  if (storage.ygoroot !== rootdir) {
    storage.ygoroot = rootdir

    const { dict, records } = await loadCDB(path.join(rootdir, 'cards.cdb'))

    storage.dict = dict
    storage.list = records

    log.info(`handleYGOPROPathUpdate: cdb size ${storage.dict.size}`)
  }
  log.info(`handleYGOPROPathUpdate: done.`)
}

ipcMain.handle('query-card-info', (_, code: number) => {
  return storage.dict.get(code)
})

ipcMain.on('query-card-info-sync', (e, code: number) => {
  e.returnValue = storage.dict.get(code)
})

ipcMain.handle('random-avatar-card', (_, tags: { includes: CTypeEnums[], excludes?: CTypeEnums[] }) => {
  const fits = storage.list.filter(
    c => tags.includes.every(t => c.types.includes(t))
      && (tags.excludes ?? ['TOKEN']).every(t => !c.types.includes(t))
  )

  return fits[randomInt(fits.length)]
})

ipcMain.handle('select-ygopro-path', async () => {
  const dir = await promptYGOPROPathSelect()
  if (dir) {
    await handleYGOPROPathUpdate(dir)
  }
  return dir
})

ipcMain.handle('write-clipboard', (_, text) => {
  clipboard.writeText(text)
})

ipcMain.handle('database', () => storage.list)

ipcMain.handle('start-ygopro', async (_, args: {
  draft_id: string
  server:   string
  passcode: string
  deck:     number[]
}) => {
  if (!existsSync(path.join(storage.ygoroot, 'deck', `picky.${args.draft_id}`))) {
    await generateYdk(args.draft_id, args.deck)
  }

  await setLastDeck(args.draft_id)
  const [host, port] = args.server.split(':')
  const ygoargs = ['-h', host, '-p', port, '-w', args.passcode, '-j']

  spawn('ygopro.exe', ygoargs, { detached: true, cwd: storage.ygoroot })
    .on('error', e => log.error(e))
})

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support')
  sourceMapSupport.install()
}

const isDevelopment = process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true'

if (isDevelopment) {
  require('electron-debug')()
}

async function main() {
  const locked = app.requestSingleInstanceLock()

  if (!locked) {
    dialog.showErrorBox('不支持多开', 'see you')
    app.quit()
  }

  app.on('window-all-closed', () => app.quit())
  await app.whenReady()

  const store = new Conf({ projectName: 'Picky' })
  const ygoroot = store.get('ygoroot') ?? await promptYGOPROPathSelect()
  if (!ygoroot) { return app.quit() }

  store.set('ygoroot', ygoroot)
  await handleYGOPROPathUpdate(ygoroot as string)

  protocol.registerFileProtocol('cimg', async (request, callback) => {
    if (!storage.ygoroot) { log.error(`ygoroot not load`) }

    const id = atoi10(new URL(request.url).hostname)
    if (!defined(id)) {
      return callback({ path: path.join(storage.ygoroot, 'textures', 'unknown.jpg') })
    } else {
      return callback({ path: path.join(storage.ygoroot, 'pics', `${id}.jpg`) })
    }
  })

  const mainWindow = new BrowserWindow({
    show:           false,
    width:          1300,
    height:         750,
    icon:           getAssetPath('icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  })

  mainWindow.loadURL(resolveHtmlPath('index.html'))

  if (isDevelopment) {
    mainWindow.webContents.openDevTools()
  }

  log.transports.file.level = 'info'
  autoUpdater.logger        = log
  autoUpdater.checkForUpdatesAndNotify()

  mainWindow.on('ready-to-show', () => {
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize()
    } else {
      mainWindow.show()
    }
  })

  app.on('second-instance', () => {
    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }
  })
}

async function promptYGOPROPathSelect() {
  const homedir = process.platform === 'win32'
    ? process.env.USERPROFILE
    : process.env.HOME
  const defaultdir = process.platform === 'win32'
    ? path.join(homedir!, 'AppData', 'Roaming', 'MyCardLibrary', 'ygopro')
    : homedir!

  log.info(`defaultdir => ${defaultdir}`)
  const result = await dialog.showOpenDialog({
    title:       '选择YGOPRO目录',
    defaultPath: defaultdir,
    message:     'where is your ygopro?',
    properties:  ['openDirectory']
  })

  log.info(`ygopro path => ${result.filePaths[0]}`)

  return (result.canceled || !result.filePaths[0])
    ? Promise.reject(new Error(`not selected`))
    : result.filePaths[0]
}

// TODO: eh... 2021-12-05 15:07:41
async function setLastDeck(draft_id: string) {
  const conffile = path.join(storage.ygoroot, 'system.conf')
  const content = await readFile(conffile).then(s => s.toString())
  const lines = content.split('\r\n')
  const modified = lines.map(line => {
    const [key] = line.split('=')
    return key.trim() === 'lastdeck' ? `lastdeck = picky.${draft_id}` : line
  }).join('\r\n')
  await writeFile(conffile, modified)
}

async function generateYdk(draft_id: string, cards: number[]) {
  const filename  = `picky.${draft_id}.ydk`

  const main: number[] = []
  const extra: number[] = []
  const etags: CTypeEnums[] = ['XYZ', 'SYNCHRO', 'LINK', 'FUSION']
  for (const code of cards) {
    const info = storage.dict.get(code)
    if (!info) {
      log.warn(`Unknown: ${code}`)
      continue
    }

    if (etags.some(t => info.types.includes(t))) {
      extra.push(code)
    } else {
      main.push(code)
    }
  }

  const content = [`#generated by Picky.`, `#main`, ...main, `#extra`, ...extra].join('\r\n')

  await writeFile(path.join(storage.ygoroot, 'deck', filename), content)

  return filename
}


main().catch(e => log.error(e))
