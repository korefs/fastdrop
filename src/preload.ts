import { contextBridge, ipcRenderer } from 'electron'
import { AvailableProviders } from './interfaces/types'

const electronAPI = {
  uploadFile: (filePath: string, service: AvailableProviders) =>
    ipcRenderer.invoke('upload-file', filePath, service),
  
  hideWindow: () => ipcRenderer.invoke('hide-window'),
  
  showFileDialog: () => ipcRenderer.invoke('show-file-dialog'),
  
  onFileSelected: (callback: (filePath: string) => void) =>
    ipcRenderer.on('file-selected', (_, filePath) => callback(filePath)),
  
  onFilesDropped: (callback: (files: string[]) => void) =>
    ipcRenderer.on('files-dropped', (_, files) => callback(files)),
    
  onFilesSelected: (callback: (files: string[]) => void) =>
    ipcRenderer.on('files-selected', (_, files) => callback(files)),
    
  saveGoogleCredentials: (clientId: string, clientSecret: string) =>
    ipcRenderer.invoke('save-google-credentials', clientId, clientSecret),
    
  getGoogleCredentials: () =>
    ipcRenderer.invoke('get-google-credentials'),
    
  setAutoStart: (enabled: boolean) =>
    ipcRenderer.invoke('set-auto-start', enabled),
    
  getAutoStart: () =>
    ipcRenderer.invoke('get-auto-start'),
    
  checkForUpdates: () =>
    ipcRenderer.invoke('check-for-updates'),
    
  installUpdate: () =>
    ipcRenderer.invoke('install-update'),
    
  getVersion: () =>
    ipcRenderer.invoke('get-version'),
    
  onUpdateAvailable: (callback: (info: any) => void) =>
    ipcRenderer.on('update-available', (_, info) => callback(info)),
    
  onDownloadProgress: (callback: (progress: any) => void) =>
    ipcRenderer.on('download-progress', (_, progress) => callback(progress)),
    
  onUpdateDownloaded: (callback: (info: any) => void) =>
    ipcRenderer.on('update-downloaded', (_, info) => callback(info)),
    
  onUpdateError: (callback: (error: string) => void) =>
    ipcRenderer.on('update-error', (_, error) => callback(error)),
    
  setAutoCopy: (enabled: boolean) =>
    ipcRenderer.invoke('set-auto-copy', enabled),
    
  getAutoCopy: () =>
    ipcRenderer.invoke('get-auto-copy'),
    
  showNotification: (title: string, body: string, url?: string) =>
    ipcRenderer.invoke('show-notification', title, body, url),
    
  saveUploadHistory: (files: any[]) =>
    ipcRenderer.invoke('save-upload-history', files),
    
  getUploadHistory: () =>
    ipcRenderer.invoke('get-upload-history'),
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)