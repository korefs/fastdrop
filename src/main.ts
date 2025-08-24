import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, Notification, Tray } from 'electron'
import { autoUpdater } from 'electron-updater'
import FormData from 'form-data'
import { existsSync } from 'fs'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { google } from 'googleapis'
import fetch from 'node-fetch'
import { homedir } from 'os'
import { join } from 'path'
import { Readable } from 'stream'

const isDev = process.env.NODE_ENV === 'development'

let tray: Tray | null = null
let mainWindow: BrowserWindow | null = null

const getConfigPath = () => {
  const configDir = join(homedir(), '.fastdrop')
  return join(configDir, 'config.json')
}

const ensureConfigDir = async () => {
  const configDir = join(homedir(), '.fastdrop')
  if (!existsSync(configDir)) {
    await mkdir(configDir, { recursive: true })
  }
}

const setAutoStart = (enabled: boolean) => {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    name: 'FastDrop'
  })
}

const getAutoStart = (): boolean => {
  return app.getLoginItemSettings().openAtLogin
}

// Auto updater configuration
if (!isDev) {
  // Configure the update server
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'korefs',
    repo: 'fastdrop'
  })
  
  autoUpdater.checkForUpdatesAndNotify()
} else {
  // In development, we can test by setting a specific feed URL
  console.log('Development mode - auto updater disabled')
}

autoUpdater.on('checking-for-update', () => {
  console.log('Checking for update...')
})

autoUpdater.on('update-available', (info) => {
  console.log('Update available.', info)
  mainWindow?.webContents.send('update-available', info)
})

autoUpdater.on('update-not-available', (info) => {
  console.log('Update not available.', info)
})

autoUpdater.on('error', (err) => {
  console.log('Error in auto-updater:', err)
  mainWindow?.webContents.send('update-error', err.message)
})

autoUpdater.on('download-progress', (progressObj) => {
  console.log('Download progress: ' + Math.round(progressObj.percent) + '%')
  mainWindow?.webContents.send('download-progress', progressObj)
})

autoUpdater.on('update-downloaded', (info) => {
  console.log('Update downloaded', info)
  mainWindow?.webContents.send('update-downloaded', info)
})

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 500,
    show: false,
    frame: false,
    resizable: false,
    transparent: true,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, 'preload.js'),
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('blur', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.hide()
    }
  })
}

function createTray(): void {
  // Try to use native system icons first with smaller size
  let icon = nativeImage.createFromNamedImage('NSImageNameShareTemplate', [14, 14])
  
  if (icon.isEmpty()) {
    // Fallback: create a smaller, more compact upload box icon
    const size = 14
    const canvas = Buffer.alloc(size * size * 4) // RGBA buffer
    
    // More compact box outline (smaller and cleaner)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const index = (y * size + x) * 4
        // Draw a compact box outline
        if ((x === 2 || x === size - 3) && y >= 3 && y <= size - 4) {
          canvas[index] = 0     // R
          canvas[index + 1] = 0 // G  
          canvas[index + 2] = 0 // B
          canvas[index + 3] = 255 // A
        } else if ((y === 3 || y === size - 4) && x >= 2 && x <= size - 3) {
          canvas[index] = 0     // R
          canvas[index + 1] = 0 // G
          canvas[index + 2] = 0 // B
          canvas[index + 3] = 255 // A
        }
        // Add smaller upload arrow in the center
        else if ((x === Math.floor(size/2) && y >= 5 && y <= 7) || 
                 (y === 5 && x >= Math.floor(size/2) - 1 && x <= Math.floor(size/2) + 1)) {
          canvas[index] = 0     // R
          canvas[index + 1] = 0 // G
          canvas[index + 2] = 0 // B
          canvas[index + 3] = 255 // A
        }
      }
    }
    
    icon = nativeImage.createFromBuffer(canvas, { width: size, height: size })
  }
  
  // Resize to ensure consistent small size across all macOS versions
  icon = icon.resize({ width: 14, height: 14 })
  
  // Set as template image for proper dark/light mode support
  icon.setTemplateImage(true)
  tray = new Tray(icon)
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Upload File',
      click: async () => {
        const result = await dialog.showOpenDialog({
          properties: ['openFile'],
          filters: [
            { name: 'All Files', extensions: ['*'] }
          ]
        })
        
        if (!result.canceled && result.filePaths.length > 0) {
          showWindow()
          mainWindow?.webContents.send('file-selected', result.filePaths[0])
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit()
      }
    }
  ])

  tray.setToolTip('FastDrop - Drag files here to upload')
  tray.setContextMenu(contextMenu)
  
  tray.on('click', () => {
    showWindow()
  })

  tray.on('drop-files', (event, files) => {
    if (files.length > 0) {
      showWindow()
      mainWindow?.webContents.send('files-dropped', files)
    }
  })

  // Show window when dragging files over the tray icon
  tray.on('drag-enter', () => {
    showWindow()
  })

  // Show window when mouse enters tray area (macOS specific)
  if (process.platform === 'darwin') {
    tray.on('mouse-enter', () => {
      // Small delay to avoid accidental triggers
      setTimeout(() => {
        showWindow()
      }, 200)
    })
  }
}

function showWindow(): void {
  if (mainWindow) {
    const bounds = tray?.getBounds()
    if (bounds) {
      const windowBounds = mainWindow.getBounds()
      const x = Math.round(bounds.x + bounds.width / 2 - windowBounds.width / 2)
      const y = Math.round(bounds.y + bounds.height + 4)
      
      mainWindow.setPosition(x, y, false)
    }
    mainWindow.show()
    mainWindow.focus()
  }
}

app.whenReady().then(async () => {
  // Hide app from dock on macOS
  if (process.platform === 'darwin' && app.dock) {
    app.dock.hide()
  }
  
  // Request notification permission on macOS
  if (process.platform === 'darwin' && Notification.isSupported()) {
    try {
      // On macOS, we need to set the app name for notifications
      app.setAppUserModelId('com.fastdrop.app')
      console.log('Notification permissions configured')
    } catch (error) {
      console.error('Failed to configure notification permissions:', error)
    }
  }
  
  createWindow()
  createTray()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // Keep the app running on macOS
})

ipcMain.handle('upload-file', async (event, filePath: string, service: 'googledrive' | '0x0') => {
  try {
    const fileBuffer = await readFile(filePath)
    const fileName = filePath.split('/').pop() || 'file'
    
    if (service === '0x0') {
      return await uploadTo0x0(fileBuffer, fileName)
    } else {
      return await uploadToGoogleDrive(fileBuffer, fileName)
    }
  } catch (error) {
    throw new Error(`Upload failed: ${error}`)
  }
})

async function uploadTo0x0(fileBuffer: Buffer, fileName: string): Promise<string> {
  const formData = new FormData()
  formData.append('file', fileBuffer, fileName)

  const response = await fetch('https://0x0.st', {
    method: 'POST',
    body: formData,
    headers: {
      ...formData.getHeaders(),
      'User-Agent': 'FastDrop/1.0 (macOS File Uploader)',
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Upload to 0x0.st failed: ${response.status} ${response.statusText} - ${errorText}`)
  }

  const responseText = await response.text()
  return responseText.trim()
}

async function uploadToGoogleDrive(fileBuffer: Buffer, fileName: string): Promise<string> {
  try {
    let CLIENT_ID: string
    let CLIENT_SECRET: string
    
    // Try to load from stored config first
    try {
      const configPath = getConfigPath()
      if (existsSync(configPath)) {
        const configData = await readFile(configPath, 'utf-8')
        const config = JSON.parse(configData)
        if (config.googleCredentials) {
          CLIENT_ID = config.googleCredentials.clientId
          CLIENT_SECRET = config.googleCredentials.clientSecret
        } else {
          throw new Error('No stored credentials')
        }
      } else {
        throw new Error('No config file')
      }
    } catch {
      // Fallback to environment variables
      CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ''
      CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || ''
    }
    
    if (!CLIENT_ID || !CLIENT_SECRET) {
      throw new Error('Google Drive credentials not configured. Please configure them in the settings.')
    }
    
    const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob'

    const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI)
    
    const drive = google.drive({ version: 'v3', auth: oauth2Client })
    
    const fileStream = new Readable({
      read() {
        this.push(fileBuffer)
        this.push(null)
      }
    })

    const response = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: ['1234567890'],
      },
      media: {
        body: fileStream,
      },
    })

    const fileId = response.data.id
    if (!fileId) {
      throw new Error('Failed to upload file to Google Drive')
    }

    await drive.permissions.create({
      fileId: fileId,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    })

    return `https://drive.google.com/file/d/${fileId}/view`
  } catch (error) {
    console.error('Google Drive upload error:', error)
    throw new Error(`Google Drive upload failed: ${error}`)
  }
}

ipcMain.handle('hide-window', () => {
  mainWindow?.hide()
})

ipcMain.handle('show-file-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'All Files', extensions: ['*'] }
    ]
  })
  
  if (!result.canceled && result.filePaths.length > 0) {
    mainWindow?.webContents.send('files-selected', result.filePaths)
  }
})

ipcMain.handle('save-google-credentials', async (_, clientId: string, clientSecret: string) => {
  try {
    await ensureConfigDir()
    const configPath = getConfigPath()
    
    let config: any = {}
    
    // Try to read existing config
    try {
      if (existsSync(configPath)) {
        const configData = await readFile(configPath, 'utf-8')
        config = JSON.parse(configData)
      }
    } catch {
      // If file doesn't exist or is corrupted, start with empty config
      config = {}
    }
    
    config.googleCredentials = {
      clientId,
      clientSecret
    }
    
    await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')
  } catch (error) {
    throw new Error(`Failed to save credentials: ${error}`)
  }
})

ipcMain.handle('get-google-credentials', async () => {
  try {
    const configPath = getConfigPath()
    if (!existsSync(configPath)) {
      return null
    }
    
    const configData = await readFile(configPath, 'utf-8')
    const config = JSON.parse(configData)
    
    if (config.googleCredentials && config.googleCredentials.clientId && config.googleCredentials.clientSecret) {
      return {
        clientId: config.googleCredentials.clientId,
        clientSecret: config.googleCredentials.clientSecret
      }
    }
    
    return null
  } catch {
    return null
  }
})

ipcMain.handle('set-auto-start', async (_, enabled: boolean) => {
  try {
    setAutoStart(enabled)
    
    // Save to config file as well
    await ensureConfigDir()
    const configPath = getConfigPath()
    
    let config: any = {}
    
    try {
      if (existsSync(configPath)) {
        const configData = await readFile(configPath, 'utf-8')
        config = JSON.parse(configData)
      }
    } catch {
      config = {}
    }
    
    config.autoStart = enabled
    await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')
    
    return true
  } catch (error) {
    console.error('Failed to set auto-start:', error)
    return false
  }
})

ipcMain.handle('get-auto-start', async () => {
  try {
    // First check system setting
    const systemAutoStart = getAutoStart()
    
    // Then check config file
    const configPath = getConfigPath()
    let configAutoStart = false
    
    try {
      if (existsSync(configPath)) {
        const configData = await readFile(configPath, 'utf-8')
        const config = JSON.parse(configData)
        configAutoStart = config.autoStart || false
      }
    } catch {
      // Ignore config file errors
    }
    
    // Return system setting as it's the source of truth
    return systemAutoStart
  } catch {
    return false
  }
})

// Auto updater IPC handlers
ipcMain.handle('check-for-updates', async () => {
  if (!isDev) {
    try {
      const result = await autoUpdater.checkForUpdates()

    } catch (error) {
      console.error('Failed to check for updates:', error)
      return null
    }
  }
  return null
})

ipcMain.handle('install-update', () => {
  if (!isDev) {
    autoUpdater.quitAndInstall()
  }
})

ipcMain.handle('get-version', () => {
  return app.getVersion()
})

// Notification IPC handler
ipcMain.handle('show-notification', async (_, title: string, body: string, url?: string) => {
  try {
    if (!Notification.isSupported()) {
      console.log('Notifications not supported')
      return false
    }

    const notification = new Notification({
      title: title,
      body: body,
      icon: nativeImage.createFromNamedImage('NSImageNameShareTemplate', [64, 64]),
      silent: false
    })

    // If URL is provided, handle click to copy to clipboard
    if (url) {
      notification.on('click', () => {
        // Focus the main window when notification is clicked
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        }
      })
    }

    notification.show()
    return true
  } catch (error) {
    console.error('Failed to show notification:', error)
    return false
  }
})

// Auto copy IPC handlers
ipcMain.handle('set-auto-copy', async (_, enabled: boolean) => {
  try {
    await ensureConfigDir()
    const configPath = getConfigPath()
    
    let config: any = {}
    
    try {
      if (existsSync(configPath)) {
        const configData = await readFile(configPath, 'utf-8')
        config = JSON.parse(configData)
      }
    } catch {
      config = {}
    }
    
    config.autoCopy = enabled
    await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')
    
    return true
  } catch (error) {
    console.error('Failed to set auto-copy:', error)
    return false
  }
})

ipcMain.handle('get-auto-copy', async () => {
  try {
    const configPath = getConfigPath()
    if (!existsSync(configPath)) {
      return false // Default is false
    }
    
    const configData = await readFile(configPath, 'utf-8')
    const config = JSON.parse(configData)
    
    return config.autoCopy || false
  } catch {
    return false
  }
})