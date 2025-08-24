import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { AlertCircle, Check, Cloud, FileUp, Settings, Upload, X } from 'lucide-react'
import { useEffect, useState } from 'react'

declare global {
  interface Window {
    electronAPI: {
      uploadFile: (filePath: string, service: 'googledrive' | '0x0') => Promise<string>
      hideWindow: () => void
      showFileDialog: () => void
      onFileSelected: (callback: (filePath: string) => void) => void
      onFilesDropped: (callback: (files: string[]) => void) => void
      onFilesSelected: (callback: (files: string[]) => void) => void
      saveGoogleCredentials: (clientId: string, clientSecret: string) => Promise<void>
      getGoogleCredentials: () => Promise<{clientId: string, clientSecret: string} | null>
      setAutoStart: (enabled: boolean) => Promise<boolean>
      getAutoStart: () => Promise<boolean>
      checkForUpdates: () => Promise<any>
      installUpdate: () => void
      getVersion: () => Promise<string>
      onUpdateAvailable: (callback: (info: any) => void) => void
      onDownloadProgress: (callback: (progress: any) => void) => void
      onUpdateDownloaded: (callback: (info: any) => void) => void
      onUpdateError: (callback: (error: string) => void) => void
      setAutoCopy: (enabled: boolean) => Promise<boolean>
      getAutoCopy: () => Promise<boolean>
      showNotification: (title: string, body: string, url?: string) => Promise<boolean>
    }
  }
}

type UploadState = 'idle' | 'uploading' | 'success' | 'error'

interface FileUpload {
  path: string
  name: string
  state: UploadState
  progress: number
  url?: string
  error?: string
}

function App() {
  const [isDragOver, setIsDragOver] = useState(false)
  const [files, setFiles] = useState<FileUpload[]>([])
  const [selectedService, setSelectedService] = useState<'googledrive' | '0x0'>('0x0')
  const [showSettings, setShowSettings] = useState(false)
  const [googleCredentials, setGoogleCredentials] = useState<{clientId: string, clientSecret: string} | null>(null)
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [autoStart, setAutoStartState] = useState(false)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [updateDownloaded, setUpdateDownloaded] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [currentVersion, setCurrentVersion] = useState('')
  const [newVersion, setNewVersion] = useState('')
  const [autoCopy, setAutoCopyState] = useState(false)
  const [updateError, setUpdateError] = useState('')

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.onFileSelected((filePath) => {
        addFile(filePath)
      })

      window.electronAPI.onFilesDropped((filePaths) => {
        filePaths.forEach(addFile)
      })
      
      window.electronAPI.onFilesSelected((filePaths) => {
        filePaths.forEach(addFile)
      })

      // Load existing Google credentials
      window.electronAPI.getGoogleCredentials().then((credentials) => {
        if (credentials) {
          setGoogleCredentials(credentials)
          setClientId(credentials.clientId)
          setClientSecret(credentials.clientSecret)
        }
      })

      // Load auto-start setting
      window.electronAPI.getAutoStart().then((enabled) => {
        setAutoStartState(enabled)
      })

      // Load current version
      window.electronAPI.getVersion().then((version) => {
        setCurrentVersion(version)
      })

      // Setup update listeners
      window.electronAPI.onUpdateAvailable((info) => {
        setUpdateAvailable(true)
        setNewVersion(info.version)
      })

      window.electronAPI.onDownloadProgress((progress) => {
        setDownloadProgress(Math.round(progress.percent))
      })

      window.electronAPI.onUpdateDownloaded(() => {
        setUpdateDownloaded(true)
      })

      window.electronAPI.onUpdateError((error) => {
        console.error('Update error:', error)
        setUpdateError(error)
        setUpdateAvailable(false)
        setUpdateDownloaded(false)
      })

      // Load auto-copy setting
      window.electronAPI.getAutoCopy().then((enabled) => {
        setAutoCopyState(enabled)
      })
    }
  }, [])

  const addFile = (filePath: string) => {
    const fileName = filePath.split('/').pop() || filePath
    const newFile: FileUpload = {
      path: filePath,
      name: fileName,
      state: 'idle',
      progress: 0,
    }
    
    setFiles(prev => {
      // Check if file already exists to prevent duplicates
      const existingFile = prev.find(f => f.path === filePath)
      if (existingFile) {
        return prev
      }
      return [...prev, newFile]
    })
  }

  const uploadFile = async (fileIndex: number) => {
    const file = files[fileIndex]
    if (!file || !window.electronAPI) return

    setFiles(prev => prev.map((f, i) => 
      i === fileIndex ? { ...f, state: 'uploading', progress: 0 } : f
    ))

    const progressInterval = setInterval(() => {
      setFiles(prev => prev.map((f, i) => {
        if (i === fileIndex && f.state === 'uploading' && f.progress < 90) {
          return { ...f, progress: f.progress + 10 }
        }
        return f
      }))
    }, 200)

    try {
      const url = await window.electronAPI.uploadFile(file.path, selectedService)
      clearInterval(progressInterval)
      
      setFiles(prev => prev.map((f, i) => 
        i === fileIndex ? { 
          ...f, 
          state: 'success', 
          progress: 100, 
          url: url.trim() 
        } : f
      ))

      // Auto-copy URL if enabled
      if (autoCopy && url) {
        copyToClipboard(url.trim())
      }

      // Show notification for successful upload
      if (window.electronAPI && url) {
        const fileName = file.name
        const notificationBody = autoCopy 
          ? `${fileName} uploaded successfully! Link copied to clipboard.`
          : `${fileName} uploaded successfully! Click to view in app.`
        
        window.electronAPI.showNotification(
          'FastDrop - Upload Complete',
          notificationBody,
          url.trim()
        )
      }
    } catch (error) {
      clearInterval(progressInterval)
      setFiles(prev => prev.map((f, i) => 
        i === fileIndex ? { 
          ...f, 
          state: 'error', 
          progress: 0, 
          error: error instanceof Error ? error.message : 'Upload failed' 
        } : f
      ))
    }
  }

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  const copyToClipboard = (url: string) => {
    navigator.clipboard.writeText(url)
  }

  const closeApp = () => {
    if (window.electronAPI) {
      window.electronAPI.hideWindow()
    }
  }

  const saveCredentials = async () => {
    if (window.electronAPI && clientId.trim() && clientSecret.trim()) {
      try {
        await window.electronAPI.saveGoogleCredentials(clientId.trim(), clientSecret.trim())
        setGoogleCredentials({ clientId: clientId.trim(), clientSecret: clientSecret.trim() })
        setShowSettings(false)
      } catch (error) {
        console.error('Failed to save credentials:', error)
      }
    }
  }

  const toggleAutoStart = async () => {
    if (window.electronAPI) {
      try {
        const newAutoStart = !autoStart
        const success = await window.electronAPI.setAutoStart(newAutoStart)
        if (success) {
          setAutoStartState(newAutoStart)
        } else {
          console.error('Failed to set auto-start')
        }
      } catch (error) {
        console.error('Failed to toggle auto-start:', error)
      }
    }
  }

  const checkForUpdates = async () => {
    if (window.electronAPI) {
      try {
        await window.electronAPI.checkForUpdates()
      } catch (error) {
        console.error('Failed to check for updates:', error)
      }
    }
  }

  const installUpdate = () => {
    if (window.electronAPI) {
      window.electronAPI.installUpdate()
    }
  }

  const toggleAutoCopy = async () => {
    if (window.electronAPI) {
      try {
        const newAutoCopy = !autoCopy
        const success = await window.electronAPI.setAutoCopy(newAutoCopy)
        if (success) {
          setAutoCopyState(newAutoCopy)
        } else {
          console.error('Failed to set auto-copy')
        }
      } catch (error) {
        console.error('Failed to toggle auto-copy:', error)
      }
    }
  }

  return (
    <div className="w-full h-full bg-background backdrop-blur-md rounded-lg shadow-2xl border border-border">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <FileUp className="w-5 h-5 text-foreground" />
          <h1 className="font-semibold text-foreground">FastDrop</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowSettings(true)}
            className="w-6 h-6 hover:bg-accent hover:text-accent-foreground"
          >
            <Settings className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={closeApp}
            className="w-6 h-6 hover:bg-destructive/20 hover:text-destructive"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Service Selection */}
      <div className="p-4 border-b border-border">
        <div className="flex gap-2">
          <Button
            variant={selectedService === '0x0' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedService('0x0')}
            className="flex-1"
          >
            <Upload className="w-4 h-4 mr-2" />
            0x0.st
          </Button>
          <Button
            variant={selectedService === 'googledrive' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedService('googledrive')}
            className="flex-1"
            disabled={!googleCredentials}
          >
            <Cloud className="w-4 h-4 mr-2" />
            Google Drive
          </Button>
        </div>
      </div>

      {/* Drop Zone */}
      {files.length === 0 && (
        <div
          className={cn(
            "m-4 border-2 border-dashed rounded-lg p-8 text-center transition-all cursor-pointer",
            isDragOver
              ? "border-foreground bg-muted/50"
              : "border-muted-foreground hover:border-foreground"
          )}
          onDragOver={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setIsDragOver(true)
          }}
          onDragLeave={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setIsDragOver(false)
          }}
          onDragEnter={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setIsDragOver(true)
          }}
          onDrop={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setIsDragOver(false)
            
            const droppedFiles = Array.from(e.dataTransfer.files)
            droppedFiles.forEach(file => {
              // Use the path property if available (Electron), otherwise use name
              const filePath = (file as any).path || file.name
              addFile(filePath)
            })
          }}
          onClick={() => {
            // Also allow clicking to select files
            if (window.electronAPI) {
              window.electronAPI.showFileDialog()
            }
          }}
        >
          <Upload className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">
            Drop files here
          </h3>
          <p className="text-muted-foreground text-sm">
            Drag and drop your files to upload them to {selectedService === '0x0' ? '0x0.st' : 'Google Drive'}
          </p>
          <p className="text-muted-foreground text-xs mt-2">
            or click to select files
          </p>
        </div>
      )}

      {/* File List */}
      {files.length > 0 && (
        <div className="p-4 space-y-3 max-h-64 overflow-y-auto">
          {files.map((file, index) => (
            <div
              key={index}
              className="bg-card rounded-lg p-3 border border-border"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className="flex-shrink-0">
                    {file.state === 'success' && (
                      <Check className="w-4 h-4 text-green-500" />
                    )}
                    {file.state === 'error' && (
                      <AlertCircle className="w-4 h-4 text-destructive" />
                    )}
                    {file.state === 'uploading' && (
                      <Upload className="w-4 h-4 text-foreground animate-pulse" />
                    )}
                    {file.state === 'idle' && (
                      <Upload className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                  <span className="text-sm font-medium text-foreground truncate">
                    {file.name}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {file.state === 'idle' && (
                    <Button
                      size="sm"
                      onClick={() => uploadFile(index)}
                      className="text-xs px-3 py-1"
                    >
                      Upload
                    </Button>
                  )}
                  {file.state === 'success' && file.url && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyToClipboard(file.url!)}
                      className="text-xs px-3 py-1"
                    >
                      Copy URL
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeFile(index)}
                    className="w-6 h-6 hover:bg-destructive/20 hover:text-destructive"
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              </div>
              
              {file.state === 'uploading' && (
                <Progress value={file.progress} className="h-2" />
              )}
              
              {file.state === 'success' && file.url && (
                <div className="mt-2 p-2 bg-green-500/10 border border-green-500/20 rounded text-xs text-green-400 font-mono break-all">
                  {file.url}
                </div>
              )}
              
              {file.state === 'error' && file.error && (
                <div className="mt-2 p-2 bg-destructive/10 border border-destructive/20 rounded text-xs text-destructive">
                  {file.error}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-lg border border-border p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">Configurações</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowSettings(false)}
                className="w-6 h-6 hover:bg-destructive/20 hover:text-destructive"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            
            <div className="space-y-6">
              {/* Auto Start Section */}
              <div>
                <h3 className="text-md font-medium text-foreground mb-3">Sistema</h3>
                <div className="flex items-center justify-between">
                  <div>
                    <label htmlFor="autoStart" className="text-sm font-medium text-foreground">
                      Iniciar junto com o sistema
                    </label>
                    <p className="text-xs text-muted-foreground mt-1">
                      FastDrop será iniciado automaticamente quando você fizer login
                    </p>
                  </div>
                  <button
                    id="autoStart"
                    onClick={toggleAutoStart}
                    className={cn(
                      "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      autoStart ? "bg-primary" : "bg-input"
                    )}
                  >
                    <span
                      className={cn(
                        "inline-block h-4 w-4 transform rounded-full bg-background transition-transform",
                        autoStart ? "translate-x-6" : "translate-x-1"
                      )}
                    />
                  </button>
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <label htmlFor="autoCopy" className="text-sm font-medium text-foreground">
                      Copiar link automaticamente
                    </label>
                    <p className="text-xs text-muted-foreground mt-1">
                      O link será copiado automaticamente após o upload
                    </p>
                  </div>
                  <button
                    id="autoCopy"
                    onClick={toggleAutoCopy}
                    className={cn(
                      "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      autoCopy ? "bg-primary" : "bg-input"
                    )}
                  >
                    <span
                      className={cn(
                        "inline-block h-4 w-4 transform rounded-full bg-background transition-transform",
                        autoCopy ? "translate-x-6" : "translate-x-1"
                      )}
                    />
                  </button>
                </div>
              </div>

              {/* Updates Section */}
              <div>
                <h3 className="text-md font-medium text-foreground mb-3">Atualizações</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Versão Atual: {currentVersion}
                      </p>
                      {updateAvailable && (
                        <p className="text-sm text-green-500">
                          Nova versão disponível: {newVersion}
                        </p>
                      )}
                    </div>
                    <Button
                      onClick={checkForUpdates}
                      size="sm"
                      variant="outline"
                      className="text-xs px-3 py-1"
                    >
                      Verificar
                    </Button>
                  </div>
                  
                  {updateAvailable && !updateDownloaded && (
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">
                        Fazendo download da atualização...
                      </p>
                      <Progress value={downloadProgress} className="h-2" />
                      <p className="text-xs text-muted-foreground">
                        {downloadProgress}% concluído
                      </p>
                    </div>
                  )}
                  
                  {updateDownloaded && (
                    <div className="space-y-2">
                      <p className="text-sm text-green-500">
                        Atualização baixada! Reinicie para aplicar.
                      </p>
                      <Button
                        onClick={installUpdate}
                        size="sm"
                        className="text-xs px-3 py-1"
                      >
                        Reiniciar e Atualizar
                      </Button>
                    </div>
                  )}
                  
                  {updateError && (
                    <div className="space-y-2">
                      <p className="text-sm text-destructive">
                        Erro ao verificar updates: {updateError}
                      </p>
                      <Button
                        onClick={() => {
                          setUpdateError('')
                          checkForUpdates()
                        }}
                        size="sm"
                        variant="outline"
                        className="text-xs px-3 py-1"
                      >
                        Tentar Novamente
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Google Drive Section */}
              <div>
                <h3 className="text-md font-medium text-foreground mb-3">Google Drive</h3>
                <div>
                <label htmlFor="clientId" className="block text-sm font-medium text-foreground mb-2">
                  Client ID
                </label>
                <input
                  id="clientId"
                  type="text"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="Enter your Google Client ID"
                  className="w-full px-3 py-2 bg-background border border-input rounded-md text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>
              
              <div>
                <label htmlFor="clientSecret" className="block text-sm font-medium text-foreground mb-2">
                  Client Secret
                </label>
                <input
                  id="clientSecret"
                  type="password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder="Enter your Google Client Secret"
                  className="w-full px-3 py-2 bg-background border border-input rounded-md text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>
              
                <div className="text-xs text-muted-foreground">
                  <p>Para configurar o Google Drive:</p>
                  <ol className="list-decimal list-inside mt-1 space-y-1">
                    <li>Acesse o Google Cloud Console</li>
                    <li>Crie um novo projeto ou selecione um existente</li>
                    <li>Habilite a API do Google Drive</li>
                    <li>Crie credenciais OAuth 2.0</li>
                    <li>Copie o Client ID e Client Secret aqui</li>
                  </ol>
                </div>
              </div>
              
              <div className="flex justify-end gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setShowSettings(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={saveCredentials}
                  disabled={!clientId.trim() || !clientSecret.trim()}
                >
                  Save
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App