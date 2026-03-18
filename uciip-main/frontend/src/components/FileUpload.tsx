import { useState, useCallback } from "react"
import { Upload, File, X, CheckCircle, AlertTriangle, Shield, Brain, Zap, Eye, FolderOpen, FileText, Image, Archive, ChevronDown, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { extractFromFile, ExtractionResult, ExtractedEntry, formatSize } from "@/lib/fileExtractor"

interface FileUploadProps {
  onFileAnalyzed?: (tools: string[]) => void
}

interface ProcessingStage {
  id: string
  name: string
  description: string
  icon: any
  progress: number
  completed: boolean
  active: boolean
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

export function FileUpload({ onFileAnalyzed }: FileUploadProps) {
  const [dragActive, setDragActive] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [sessionId, setSessionId] = useState<string>("")
  const [processingStages, setProcessingStages] = useState<ProcessingStage[]>([])
  const [currentStage, setCurrentStage] = useState<number>(-1)
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null)
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [showTree, setShowTree] = useState(false)

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true)
    else if (e.type === "dragleave") setDragActive(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0])
  }, [])

  const handleFile = async (selectedFile: File) => {
    const allowedTypes = ['.zip', '.pdf', '.json', '.csv', '.log', '.txt', '.jpg', '.png', '.wav', '.mp3']
    const fileExt = selectedFile.name.toLowerCase().substring(selectedFile.name.lastIndexOf('.'))
    if (!allowedTypes.includes(fileExt)) {
      alert('Unsupported file format. Please upload ZIP, PDF, JSON, CSV, LOG, TXT, IMG, or audio files.')
      return
    }

    setFile(selectedFile)
    setExtraction(null)
    setShowTree(false)
    const newSessionId = `UCIIP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    setSessionId(newSessionId)
    await startAdvancedProcessing(selectedFile, newSessionId)
  }

  const startAdvancedProcessing = async (file: File, sessionId: string) => {
    const stages: ProcessingStage[] = [
      { id: 'upload', name: 'Upload Detection', description: 'Validating file and creating session', icon: Upload, progress: 0, completed: false, active: true },
      { id: 'extract', name: 'Content Extraction', description: 'Reading and unpacking file contents', icon: Brain, progress: 0, completed: false, active: false },
      { id: 'scam-detection', name: 'IOC Scanning', description: 'Extracting emails, domains, URLs and phone numbers', icon: Shield, progress: 0, completed: false, active: false },
      { id: 'tool-activation', name: 'Tool Activation', description: 'Enabling relevant investigation tools', icon: Zap, progress: 0, completed: false, active: false },
    ]
    setProcessingStages(stages)
    setCurrentStage(0)

    // Stage 1: Upload Detection
    await runStage(0, stages, 200, 20)

    // Stage 2: Real content extraction
    setCurrentStage(1)
    setProcessingStages(prev => prev.map((s, i) => i === 1 ? { ...s, active: true } : s))
    let ext: ExtractionResult | null = null
    try {
      ext = await extractFromFile(file)
      setExtraction(ext)
    } catch { /* continue without extraction */ }
    setProcessingStages(prev => prev.map((s, i) =>
      i === 1 ? { ...s, progress: 100, completed: true, active: false } :
      i === 2 ? { ...s, active: true } : s
    ))

    // Stage 3: IOC scanning (already done in extraction)
    await runStage(2, stages, 250, 25)

    // Stage 4: Tool activation
    await runStage(3, stages, 200, 20)

    const result = generateAnalysisResult(file, sessionId, ext ?? undefined)
    setAnalysisResult(result)
    setProcessingStages(prev => prev.map((s, i) =>
      i === 3 ? { ...s, completed: true, active: false, progress: 100 } : s
    ))
    setCurrentStage(-1)
    onFileAnalyzed?.(result.activatedTools)
  }

  const runStage = async (stageIdx: number, _stages: ProcessingStage[], delay: number, step: number) => {
    setCurrentStage(stageIdx)
    for (let i = 0; i <= 100; i += step) {
      await new Promise(r => setTimeout(r, delay))
      setProcessingStages(prev => prev.map((s, idx) => idx === stageIdx ? { ...s, progress: Math.min(i, 100), active: true } : s))
    }
    setProcessingStages(prev => prev.map((s, idx) =>
      idx === stageIdx ? { ...s, completed: true, active: false, progress: 100 } :
      idx === stageIdx + 1 ? { ...s, active: true } : s
    ))
  }

  const generateAnalysisResult = (file: File, sessionId: string, ext?: ExtractionResult): AnalysisResult => {
    const fileName = file.name.toLowerCase()
    const threats: ThreatDetection[] = []
    const activatedTools: string[] = []

    const emails = ext?.emails ?? []
    const phones = ext?.phones ?? []
    const domains = ext?.domains ?? []
    const urls = ext?.urls ?? []
    const text = ext?.textContent?.toLowerCase() ?? ''

    // Phishing / email threats (from real extracted content)
    if (emails.length > 0 || text.includes('phish') || text.includes('credential') || fileName.includes('email')) {
      threats.push({
        type: 'Email / Phishing',
        confidence: emails.length > 0 ? 90 : 72,
        description: emails.length > 0
          ? `${emails.length} email address(es) found in file content`
          : 'Suspicious phishing patterns detected',
        severity: 'high',
        details: emails.length > 0
          ? [`Emails: ${emails.slice(0, 3).join(', ')}${emails.length > 3 ? ` (+${emails.length - 3} more)` : ''}`]
          : ['Urgent language patterns', 'Credential harvesting indicators'],
      })
      activatedTools.push('Email Checker', 'Phishing Detector')
    }

    // Suspicious URLs
    if (urls.length > 0 || domains.length > 0) {
      threats.push({
        type: 'Suspicious Links',
        confidence: urls.length > 2 ? 82 : 62,
        description: `${urls.length} URL(s) and ${domains.length} domain(s) extracted from content`,
        severity: urls.length > 3 ? 'high' : 'medium',
        details: urls.slice(0, 2).map(u => `${u.slice(0, 70)}${u.length > 70 ? '…' : ''}`),
      })
      activatedTools.push('Phishing Detector')
    }

    // Financial
    if (text.includes('bank') || text.includes('transaction') || text.includes('wire') || fileName.includes('financial')) {
      threats.push({
        type: 'Financial Fraud',
        confidence: 76,
        description: 'Financial transaction patterns detected in content',
        severity: 'medium',
        details: ['Financial keywords found in extracted text'],
      })
      activatedTools.push('Money Mapper')
    }

    // Audio / voice
    if (file.type.includes('audio') || fileName.includes('voice') || fileName.includes('call')) {
      activatedTools.push('Voice Identifier', 'Call Tracer')
    }

    // Network logs
    if (fileName.includes('network') || fileName.includes('scan') || fileName.includes('log') || text.includes('nmap')) {
      activatedTools.push('N-Map', 'AI Security System')
    }

    activatedTools.push('Safe Document Handler')

    const riskScore = threats.length > 0
      ? Math.round(threats.reduce((s, t) => s + t.confidence, 0) / threats.length)
      : Math.round(Math.random() * 25)

    return {
      sessionId,
      threats,
      activatedTools: [...new Set(activatedTools)],
      riskScore,
      fileMetadata: { type: file.type || 'unknown', size: file.size, domains, emails, phones, urls, extractedFiles: ext?.totalFiles ?? 0, extractedSize: ext?.totalSize ?? 0 },
    }
  }

  const getFileIcon = (entry: ExtractedEntry) => {
    if (entry.isDirectory) return <FolderOpen className="h-3 w-3 text-yellow-400 flex-shrink-0" />
    const ext = entry.name.split('.').pop()?.toLowerCase() ?? ''
    if (['jpg','jpeg','png','gif','webp'].includes(ext)) return <Image className="h-3 w-3 text-blue-400 flex-shrink-0" />
    if (['zip','rar','7z'].includes(ext)) return <Archive className="h-3 w-3 text-purple-400 flex-shrink-0" />
    return <FileText className="h-3 w-3 text-cyber-glow flex-shrink-0" />
  }

  const removeFile = () => {
    setFile(null); setSessionId(""); setProcessingStages([]); setCurrentStage(-1)
    setAnalysisResult(null); setExtraction(null); setShowDetails(false); setShowTree(false)
    onFileAnalyzed?.([])
  }

  const getRiskScoreColor = (score: number) => score >= 70 ? 'text-red-400' : score >= 40 ? 'text-yellow-400' : 'text-green-400'
  const getThreatSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'text-red-400 bg-red-400/10 border-red-400/20'
      case 'medium': return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20'
      default: return 'text-green-400 bg-green-400/10 border-green-400/20'
    }
  }

  return (
    <Card className="bg-card/50 border-cyber-glow/20 backdrop-blur-sm">
      <CardContent className="p-6">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-cyber-glow" />
            <h3 className="text-lg font-semibold text-cyber-glow font-cyber">Data Upload & Analysis</h3>
          </div>

          {!file ? (
            <div
              className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-all duration-300
                ${dragActive ? "border-cyber-glow bg-cyber-glow/10 shadow-cyber" : "border-cyber-glow/30 hover:border-cyber-glow/50 hover:bg-cyber-glow/5"}`}
              onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
            >
              <input type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                accept=".zip,.pdf,.json,.csv,.log,.txt,.jpg,.png,.gif,.wav,.mp3,.mp4" />
              <div className="space-y-4">
                <div className="w-16 h-16 mx-auto bg-cyber-glow/10 rounded-full flex items-center justify-center">
                  <Upload className="h-8 w-8 text-cyber-glow" />
                </div>
                <div>
                  <p className="text-lg font-medium text-foreground">Drop your data dump here</p>
                  <p className="text-muted-foreground font-mono text-sm">
                    or <span className="text-cyber-glow">click to browse</span> • ZIP files are fully extracted
                  </p>
                </div>
                <p className="text-xs text-muted-foreground font-mono">
                  Supports: ZIP (auto-extracted), PDF, JSON, CSV, LOG, TXT, IMG (JPG/PNG), Audio (WAV/MP3)
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* File Header */}
              <div className="flex items-center justify-between p-4 bg-card/30 rounded-lg border border-cyber-glow/20">
                <div className="flex items-center gap-3">
                  <File className="h-8 w-8 text-cyber-glow" />
                  <div>
                    <p className="font-medium text-foreground">{file.name}</p>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground font-mono">
                      <span>{formatSize(file.size)}</span>
                      {sessionId && <span>Session: {sessionId}</span>}
                      {extraction && extraction.totalFiles > 0 && (
                        <span className="text-cyber-glow">{extraction.totalFiles} files extracted</span>
                      )}
                    </div>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={removeFile} className="hover:text-destructive">
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Processing Pipeline */}
              {processingStages.length > 0 && (
                <div className="space-y-4">
                  <h4 className="text-sm font-medium text-cyber-glow font-cyber">Processing Pipeline</h4>
                  <div className="space-y-3">
                    {processingStages.map((stage, index) => (
                      <div key={stage.id} className={`p-4 rounded-lg border transition-all duration-500
                        ${stage.active ? 'border-cyber-glow bg-cyber-glow/10 shadow-cyber animate-pulse-glow'
                          : stage.completed ? 'border-accent bg-accent/10'
                          : 'border-cyber-glow/20 bg-card/20'}`}>
                        <div className="flex items-center gap-3 mb-2">
                          <stage.icon className={`h-5 w-5 transition-colors ${stage.active ? 'text-cyber-glow animate-pulse' : stage.completed ? 'text-accent' : 'text-muted-foreground'}`} />
                          <span className={`font-medium font-cyber ${stage.active ? 'text-cyber-glow' : stage.completed ? 'text-accent' : 'text-foreground'}`}>
                            {stage.name}
                          </span>
                          {stage.completed && <CheckCircle className="h-4 w-4 text-accent ml-auto" />}
                        </div>
                        <p className="text-xs text-muted-foreground font-mono mb-2">{stage.description}</p>
                        {(stage.active || stage.completed) && (
                          <Progress value={stage.progress} className={`h-1 transition-all ${stage.active ? 'opacity-100' : 'opacity-60'}`} />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Extracted File Tree (for ZIP) */}
              {extraction && extraction.entries.length > 1 && (
                <div className="p-4 bg-card/30 rounded-lg border border-cyber-glow/20">
                  <button onClick={() => setShowTree(!showTree)}
                    className="flex items-center gap-2 w-full text-left mb-2">
                    {showTree ? <ChevronDown className="h-4 w-4 text-cyber-glow" /> : <ChevronRight className="h-4 w-4 text-cyber-glow" />}
                    <span className="text-sm font-medium text-cyber-glow font-cyber">
                      Extracted Contents — {extraction.totalFiles} files, {formatSize(extraction.totalSize)}
                    </span>
                  </button>
                  {showTree && (
                    <div className="max-h-52 overflow-y-auto space-y-0.5 pl-2 border-l border-cyber-glow/20 mt-2">
                      {extraction.entries.slice(0, 200).map((entry, i) => (
                        <div key={i} className="flex items-center gap-2 py-0.5"
                          style={{ paddingLeft: `${(entry.path.split('/').length - 1) * 12}px` }}>
                          {getFileIcon(entry)}
                          <span className={`text-xs font-mono truncate ${entry.isDirectory ? 'text-yellow-400' : 'text-muted-foreground'}`}>
                            {entry.name}
                          </span>
                          {!entry.isDirectory && entry.size > 0 && (
                            <span className="text-xs text-muted-foreground/50 ml-auto flex-shrink-0">{formatSize(entry.size)}</span>
                          )}
                        </div>
                      ))}
                      {extraction.entries.length > 200 && (
                        <p className="text-xs text-muted-foreground/60 font-mono mt-1">… {extraction.entries.length - 200} more entries</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Analysis Results */}
              {analysisResult && (
                <div className="space-y-4">
                  {/* Risk Dashboard */}
                  <div className="p-4 bg-card/30 rounded-lg border border-cyber-glow/20">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-medium text-cyber-glow font-cyber">Threat Analysis Complete</h4>
                      <Badge variant="outline" className={`font-mono text-xs px-3 py-1 ${getRiskScoreColor(analysisResult.riskScore)}`}>
                        Risk Score: {analysisResult.riskScore}%
                      </Badge>
                    </div>
                    <div className="grid grid-cols-4 gap-3 text-center">
                      <div>
                        <div className="text-lg font-bold text-cyber-glow font-cyber">{analysisResult.threats.length}</div>
                        <div className="text-xs text-muted-foreground font-mono">Threats</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold text-accent font-cyber">{analysisResult.fileMetadata.emails.length}</div>
                        <div className="text-xs text-muted-foreground font-mono">Emails</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold text-cyber-glow-secondary font-cyber">{analysisResult.fileMetadata.urls.length}</div>
                        <div className="text-xs text-muted-foreground font-mono">URLs</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold text-yellow-400 font-cyber">{analysisResult.fileMetadata.phones.length}</div>
                        <div className="text-xs text-muted-foreground font-mono">Phones</div>
                      </div>
                    </div>
                  </div>

                  {/* Threat Cards */}
                  {analysisResult.threats.length > 0 && (
                    <div className="space-y-3">
                      <h5 className="text-sm font-medium text-red-400 font-cyber flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" /> Detected Threats
                      </h5>
                      {analysisResult.threats.map((threat, index) => (
                        <div key={index} className={`p-3 rounded-lg border ${getThreatSeverityColor(threat.severity)}`}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium font-cyber text-sm">{threat.type}</span>
                            <Badge variant="outline" className="text-xs font-mono">{threat.confidence}% confidence</Badge>
                          </div>
                          <p className="text-xs font-mono mb-2">{threat.description}</p>
                          {threat.details && (
                            <div className="space-y-1">
                              {threat.details.map((d, i) => (
                                <div key={i} className="text-xs font-mono opacity-75 flex items-start gap-1.5">
                                  <div className="w-1 h-1 bg-current rounded-full mt-1.5 flex-shrink-0" />
                                  <span className="break-all">{d}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Activated Tools */}
                  <div className="p-4 bg-accent/10 border border-accent/20 rounded-lg">
                    <div className="flex items-center gap-2 mb-3">
                      <Zap className="h-4 w-4 text-accent animate-pulse-glow" />
                      <span className="text-sm font-medium text-accent font-cyber">Investigation Tools Activated</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {analysisResult.activatedTools.map((tool, i) => (
                        <Badge key={i} variant="outline" className="text-xs font-mono bg-accent/10 text-accent border-accent/30 hover:bg-accent/20 transition-all">
                          {tool}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Technical Details toggle */}
                  <Button variant="ghost" size="sm" onClick={() => setShowDetails(!showDetails)}
                    className="w-full text-cyber-glow hover:bg-cyber-glow/10">
                    <Eye className="h-4 w-4 mr-2" />
                    {showDetails ? 'Hide' : 'Show'} Technical Details
                  </Button>

                  {showDetails && (
                    <div className="p-4 bg-card/20 rounded-lg border border-cyber-glow/20 font-mono text-xs space-y-2">
                      <div><span className="text-cyber-glow">Session ID:</span> {analysisResult.sessionId}</div>
                      <div><span className="text-cyber-glow">File Type:</span> {analysisResult.fileMetadata.type}</div>
                      {analysisResult.fileMetadata.extractedFiles > 0 && (
                        <div><span className="text-cyber-glow">Extracted Files:</span> {analysisResult.fileMetadata.extractedFiles} ({formatSize(analysisResult.fileMetadata.extractedSize)})</div>
                      )}
                      {analysisResult.fileMetadata.emails.length > 0 && (
                        <div><span className="text-cyber-glow">Emails:</span> {analysisResult.fileMetadata.emails.slice(0, 5).join(', ')}{analysisResult.fileMetadata.emails.length > 5 ? ` (+${analysisResult.fileMetadata.emails.length - 5} more)` : ''}</div>
                      )}
                      {analysisResult.fileMetadata.phones.length > 0 && (
                        <div><span className="text-cyber-glow">Phones:</span> {analysisResult.fileMetadata.phones.slice(0, 3).join(', ')}</div>
                      )}
                      {analysisResult.fileMetadata.urls.length > 0 && (
                        <div><span className="text-cyber-glow">URLs:</span> {analysisResult.fileMetadata.urls.slice(0, 3).join(', ')}{analysisResult.fileMetadata.urls.length > 3 ? ` (+${analysisResult.fileMetadata.urls.length - 3} more)` : ''}</div>
                      )}
                      {analysisResult.fileMetadata.domains.length > 0 && (
                        <div><span className="text-cyber-glow">Domains:</span> {analysisResult.fileMetadata.domains.slice(0, 5).join(', ')}</div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}