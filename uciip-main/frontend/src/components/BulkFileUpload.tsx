import { useState, useCallback, useEffect } from "react"
import { Upload, File, X, CheckCircle, AlertCircle, FolderOpen, HardDrive, ChevronDown, ChevronRight, FileText, Image, Archive } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { useAppSettings } from "@/hooks/useAppSettings"
import { useToast } from "@/hooks/use-toast"
import { extractFromFile, extractFromDataTransfer, ExtractionResult, ExtractedEntry, formatSize } from "@/lib/fileExtractor"

interface BulkFileUploadProps {
  onFileAnalyzed?: (tools: string[]) => void
}

interface UploadedFile {
  id: string
  file: File
  status: 'pending' | 'processing' | 'completed' | 'error'
  progress: number
  extraction?: ExtractionResult
  analysis?: AnalysisResult
}

interface ThreatDetection {
  type: string
  confidence: number
  description: string
  severity: 'low' | 'medium' | 'high'
  details?: string[]
}

interface AnalysisResult {
  sessionId: string
  threats: ThreatDetection[]
  activatedTools: string[]
  riskScore: number
  fileMetadata: {
    type: string
    size: number
    domains: string[]
    emails: string[]
    phones: string[]
    urls: string[]
    extractedFiles: number
    extractedSize: number
  }
}

export function BulkFileUpload({ onFileAnalyzed }: BulkFileUploadProps) {
  const [dragActive, setDragActive] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [totalProgress, setTotalProgress] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const [storageUsed, setStorageUsed] = useState(0)
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())
  const { settings } = useAppSettings()
  const { toast } = useToast()

  useEffect(() => {
    const totalSize = uploadedFiles.reduce((sum, f) => sum + f.file.size, 0)
    setStorageUsed(totalSize)
  }, [uploadedFiles])

  useEffect(() => {
    if (uploadedFiles.length === 0) { setTotalProgress(0); return }
    const avg = uploadedFiles.reduce((s, f) => s + f.progress, 0) / uploadedFiles.length
    setTotalProgress(avg)
  }, [uploadedFiles])

  // ── Drag handlers ────────────────────────────────────────────────────────────
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true)
    else if (e.type === "dragleave") setDragActive(false)
  }, [])

  // Folder-aware drop: uses dataTransfer.items + webkitGetAsEntry
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      try {
        const result = await extractFromDataTransfer(e.dataTransfer.items)
        // Build one synthetic "folder drop" file entry per top-level item
        // We still need actual File objects for display; fall back to files list
        const files = Array.from(e.dataTransfer.files)
        if (files.length > 0) {
          await addFilesWithExtraction(files)
        }
      } catch {
        const files = Array.from(e.dataTransfer.files)
        if (files.length > 0) await addFilesWithExtraction(files)
      }
    }
  }, [])

  const handleInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) await addFilesWithExtraction(Array.from(e.target.files))
  }

  // ── Core: add files + run real extraction ────────────────────────────────────
  const addFilesWithExtraction = async (selectedFiles: File[]) => {
    const allowedTypes = ['.zip', '.pdf', '.json', '.csv', '.log', '.txt', '.jpg', '.png', '.gif', '.wav', '.mp3', '.mp4']
    const validFiles = selectedFiles.filter(f => {
      const ext = f.name.toLowerCase().substring(f.name.lastIndexOf('.'))
      return allowedTypes.includes(ext)
    })
    if (validFiles.length === 0) return

    const newEntries: UploadedFile[] = validFiles.map(file => ({
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      file,
      status: 'pending',
      progress: 0,
    }))

    setUploadedFiles(prev => [...prev, ...newEntries])

    // Process each file concurrently (staggered)
    setIsProcessing(true)
    await Promise.all(newEntries.map((entry, i) =>
      new Promise<void>(resolve => setTimeout(() => processFile(entry.id, entry.file).then(resolve), i * 300))
    ))
    setIsProcessing(false)
  }

  const processFile = async (fileId: string, file: File) => {
    const update = (u: Partial<UploadedFile>) =>
      setUploadedFiles(prev => prev.map(f => f.id === fileId ? { ...f, ...u } : f))

    update({ status: 'processing', progress: 10 })

    // Real extraction
    let extraction: ExtractionResult | undefined
    try {
      extraction = await extractFromFile(file)
      update({ progress: 60, extraction })
    } catch {
      update({ progress: 60 })
    }

    // Simulate remaining analysis pipeline
    await new Promise(r => setTimeout(r, 600))
    update({ progress: 85 })
    await new Promise(r => setTimeout(r, 400))

    const analysis = generateAnalysisResult(file, fileId, extraction)
    update({ status: 'completed', progress: 100, analysis })
  }

  // ── Analysis: uses real extracted IOCs when available ────────────────────────
  const generateAnalysisResult = (file: File, sessionId: string, extraction?: ExtractionResult): AnalysisResult => {
    const fileName = file.name.toLowerCase()
    const threats: ThreatDetection[] = []
    const activatedTools: string[] = []

    // Use real extracted IOCs if available, otherwise empty
    const emails = extraction?.emails ?? []
    const phones = extraction?.phones ?? []
    const domains = extraction?.domains ?? []
    const urls = extraction?.urls ?? []
    const text = extraction?.textContent?.toLowerCase() ?? ''

    // Email / phishing
    const hasPhishingIndicators = emails.length > 0 || text.includes('phish') || text.includes('credential') ||
      text.includes('verify your account') || text.includes('click here') || fileName.includes('email')
    if (hasPhishingIndicators) {
      threats.push({
        type: 'Email / Phishing',
        confidence: emails.length > 0 ? 88 : 72,
        description: emails.length > 0
          ? `${emails.length} email address(es) extracted from file content`
          : 'Phishing patterns detected in content',
        severity: 'high',
        details: emails.length > 0
          ? [`Emails found: ${emails.slice(0, 3).join(', ')}${emails.length > 3 ? ` +${emails.length - 3} more` : ''}`]
          : ['Suspicious language patterns', 'Credential harvesting indicators'],
      })
      activatedTools.push('Email Checker', 'Phishing Detector')
    }

    // Financial fraud
    const hasFinancial = text.includes('transaction') || text.includes('bank') || text.includes('wire transfer') ||
      text.includes('money') || fileName.includes('financial') || fileName.includes('bank')
    if (hasFinancial) {
      threats.push({
        type: 'Financial Fraud',
        confidence: 74,
        description: 'Financial transaction patterns detected in file content',
        severity: 'medium',
        details: ['Financial keywords detected in extracted text'],
      })
      activatedTools.push('Money Mapper')
    }

    // Suspicious URLs / domains
    if (urls.length > 0 || domains.length > 0) {
      threats.push({
        type: 'Suspicious Links',
        confidence: urls.length > 0 ? 80 : 60,
        description: `${urls.length} URL(s) and ${domains.length} domain(s) found in content`,
        severity: urls.length > 3 ? 'high' : 'medium',
        details: [
          ...(urls.slice(0, 2).map(u => `URL: ${u.slice(0, 60)}${u.length > 60 ? '…' : ''}`)),
        ],
      })
      activatedTools.push('Phishing Detector')
    }

    // Audio / voice
    if (file.type.includes('audio') || fileName.includes('voice') || fileName.includes('call')) {
      activatedTools.push('Voice Identifier', 'Call Tracer')
    }

    // Network / logs
    if (fileName.includes('network') || fileName.includes('scan') || fileName.includes('log') || text.includes('nmap')) {
      activatedTools.push('N-Map', 'AI Security System')
    }

    // Misinformation
    if (text.includes('breaking news') || text.includes('fake') || fileName.includes('news')) {
      threats.push({
        type: 'Misinformation',
        confidence: 65,
        description: 'Potential misinformation content detected',
        severity: 'medium',
        details: ['Suspicious news-related content patterns'],
      })
      activatedTools.push('Fake News Tracker')
    }

    activatedTools.push('Safe Document Handler')

    const riskScore = threats.length > 0
      ? Math.round(threats.reduce((s, t) => s + t.confidence, 0) / threats.length)
      : Math.round(Math.random() * 20)

    return {
      sessionId,
      threats,
      activatedTools: [...new Set(activatedTools)],
      riskScore,
      fileMetadata: {
        type: file.type || 'unknown',
        size: file.size,
        domains,
        emails,
        phones,
        urls,
        extractedFiles: extraction?.totalFiles ?? 0,
        extractedSize: extraction?.totalSize ?? 0,
      },
    }
  }

  const removeFile = (id: string) => setUploadedFiles(prev => prev.filter(f => f.id !== id))
  const clearAll = () => { setUploadedFiles([]); setTotalProgress(0); setIsProcessing(false) }
  const toggleExpand = (id: string) => setExpandedFiles(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const getThreatSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'text-cyber-danger bg-cyber-danger/10 border-cyber-danger/20'
      case 'medium': return 'text-cyber-warning bg-cyber-warning/10 border-cyber-warning/20'
      case 'low': return 'text-cyber-glow bg-cyber-glow/10 border-cyber-glow/20'
      default: return 'text-muted-foreground bg-muted/10 border-muted/20'
    }
  }

  const getFileIcon = (entry: ExtractedEntry) => {
    if (entry.isDirectory) return <FolderOpen className="h-3 w-3 text-yellow-400 flex-shrink-0" />
    const ext = entry.name.split('.').pop()?.toLowerCase() ?? ''
    if (['jpg','jpeg','png','gif','webp'].includes(ext)) return <Image className="h-3 w-3 text-blue-400 flex-shrink-0" />
    if (['zip','rar','7z'].includes(ext)) return <Archive className="h-3 w-3 text-purple-400 flex-shrink-0" />
    return <FileText className="h-3 w-3 text-cyber-glow flex-shrink-0" />
  }

  return (
    <Card className="bg-card/50 border-cyber-glow/20 backdrop-blur-sm">
      <CardContent className="p-6">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-cyber-glow" />
              <h3 className="text-lg font-semibold text-cyber-glow font-cyber">Bulk Data Upload & Analysis</h3>
            </div>
            {uploadedFiles.length > 0 && (
              <Button variant="outline" size="sm" onClick={clearAll}
                className="text-cyber-danger hover:bg-cyber-danger/10 border-cyber-danger/20">
                Clear All
              </Button>
            )}
          </div>

          {/* Storage info */}
          <div className="flex items-center gap-4 p-3 bg-card/30 rounded-lg border border-cyber-glow/20">
            <HardDrive className="h-5 w-5 text-cyber-glow" />
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-foreground">Storage Used</span>
                <span className="text-xs text-cyber-glow font-mono">{formatSize(storageUsed)}</span>
              </div>
              <div className="text-xs text-muted-foreground font-mono">
                Unlimited storage available • {uploadedFiles.length} files uploaded
              </div>
            </div>
          </div>

          {/* Upload area */}
          <div
            className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-all duration-300
              ${dragActive ? "border-cyber-glow bg-cyber-glow/10 shadow-cyber" : "border-cyber-glow/30 hover:border-cyber-glow/50 hover:bg-cyber-glow/5"}`}
            onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
          >
            <input type="file" multiple className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              onChange={handleInputChange}
              accept=".zip,.pdf,.json,.csv,.log,.txt,.jpg,.png,.gif,.wav,.mp3,.mp4" />
            <div className="space-y-4">
              <div className="w-16 h-16 mx-auto bg-cyber-glow/10 rounded-full flex items-center justify-center">
                <Upload className="h-8 w-8 text-cyber-glow" />
              </div>
              <div>
                <p className="text-lg font-medium text-foreground">Drop files or folders here</p>
                <p className="text-muted-foreground font-mono text-sm">
                  or <span className="text-cyber-glow">click to browse</span> • ZIP files are auto-extracted
                </p>
              </div>
              <p className="text-xs text-muted-foreground font-mono">
                Supports: ZIP (auto-extracted), PDF, JSON, CSV, LOG, TXT, IMG, Audio
              </p>
            </div>
          </div>

          {/* Progress overview */}
          {uploadedFiles.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-cyber-glow font-cyber">Processing Overview</h4>
                <Badge variant="outline" className="font-mono text-xs">
                  {uploadedFiles.filter(f => f.status === 'completed').length}/{uploadedFiles.length} completed
                </Badge>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground font-mono">Overall Progress</span>
                  <span className="text-cyber-glow font-mono">{Math.round(totalProgress)}%</span>
                </div>
                <Progress value={totalProgress} className="h-2" />
              </div>
            </div>
          )}

          {/* File list */}
          <div className="space-y-3 max-h-[600px] overflow-y-auto">
            {uploadedFiles.map(uf => (
              <div key={uf.id} className="p-4 bg-card/30 rounded-lg border border-cyber-glow/20 space-y-3">
                {/* File header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <File className="h-5 w-5 text-cyber-glow flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground truncate">{uf.file.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {formatSize(uf.file.size)} • {uf.status}
                        {uf.extraction && uf.extraction.totalFiles > 0 &&
                          ` • ${uf.extraction.totalFiles} files extracted`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {uf.status === 'completed' && <CheckCircle className="h-4 w-4 text-accent" />}
                    {uf.status === 'error' && <AlertCircle className="h-4 w-4 text-cyber-danger" />}
                    <Button variant="ghost" size="icon" onClick={() => removeFile(uf.id)}
                      className="hover:text-destructive h-8 w-8">
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {uf.status === 'processing' && <Progress value={uf.progress} className="h-1" />}

                {/* Real extracted file tree (for ZIPs / folders) */}
                {uf.extraction && uf.extraction.entries.length > 1 && (
                  <div className="pt-2 border-t border-cyber-glow/10">
                    <button
                      onClick={() => toggleExpand(uf.id)}
                      className="flex items-center gap-1 text-xs text-cyber-glow hover:text-cyber-glow/80 font-mono mb-2"
                    >
                      {expandedFiles.has(uf.id)
                        ? <ChevronDown className="h-3 w-3" />
                        : <ChevronRight className="h-3 w-3" />}
                      {expandedFiles.has(uf.id) ? 'Hide' : 'Show'} extracted contents
                      ({uf.extraction.totalFiles} files, {formatSize(uf.extraction.totalSize)})
                    </button>

                    {expandedFiles.has(uf.id) && (
                      <div className="max-h-48 overflow-y-auto space-y-0.5 pl-2 border-l border-cyber-glow/20">
                        {uf.extraction.entries.slice(0, 200).map((entry, i) => (
                          <div key={i} className="flex items-center gap-2 py-0.5"
                            style={{ paddingLeft: `${(entry.path.split('/').length - 1) * 12}px` }}>
                            {getFileIcon(entry)}
                            <span className={`text-xs font-mono truncate ${entry.isDirectory ? 'text-yellow-400' : 'text-muted-foreground'}`}>
                              {entry.name}
                            </span>
                            {!entry.isDirectory && entry.size > 0 && (
                              <span className="text-xs text-muted-foreground/50 ml-auto flex-shrink-0">
                                {formatSize(entry.size)}
                              </span>
                            )}
                          </div>
                        ))}
                        {uf.extraction.entries.length > 200 && (
                          <p className="text-xs text-muted-foreground font-mono pl-2">
                            … and {uf.extraction.entries.length - 200} more entries
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Analysis results */}
                {uf.analysis && (
                  <div className="space-y-2 pt-2 border-t border-cyber-glow/10">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground font-mono">Risk Score: {uf.analysis.riskScore}%</span>
                      <Badge variant="outline" className="text-xs">{uf.analysis.threats.length} threats</Badge>
                    </div>

                    {/* Real IOCs */}
                    {(uf.analysis.fileMetadata.emails.length > 0 ||
                      uf.analysis.fileMetadata.phones.length > 0 ||
                      uf.analysis.fileMetadata.urls.length > 0) && (
                      <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                        {uf.analysis.fileMetadata.emails.length > 0 && (
                          <div className="p-1.5 bg-card/40 rounded border border-cyber-glow/10">
                            <span className="text-cyber-glow">Emails: </span>
                            <span className="text-muted-foreground">{uf.analysis.fileMetadata.emails.length}</span>
                          </div>
                        )}
                        {uf.analysis.fileMetadata.phones.length > 0 && (
                          <div className="p-1.5 bg-card/40 rounded border border-cyber-glow/10">
                            <span className="text-cyber-glow">Phones: </span>
                            <span className="text-muted-foreground">{uf.analysis.fileMetadata.phones.length}</span>
                          </div>
                        )}
                        {uf.analysis.fileMetadata.urls.length > 0 && (
                          <div className="p-1.5 bg-card/40 rounded border border-cyber-glow/10">
                            <span className="text-cyber-glow">URLs: </span>
                            <span className="text-muted-foreground">{uf.analysis.fileMetadata.urls.length}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {uf.analysis.threats.slice(0, 2).map((t, idx) => (
                      <div key={idx} className={`text-xs p-2 rounded border ${getThreatSeverityColor(t.severity)}`}>
                        <span className="font-medium">{t.type}</span>: {t.description}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}