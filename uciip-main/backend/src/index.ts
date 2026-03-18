import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const DATA_DIR = path.join(__dirname, '../data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}

app.use(cors());
app.use(express.json());

// --- Simple Local Persistence Helpers ---
const getDataFile = (name: string) => path.join(DATA_DIR, `${name}.json`);

const readData = (name: string, defaultData: any) => {
  const file = getDataFile(name);
  if (!fs.existsSync(file)) return defaultData;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (err) {
    return defaultData;
  }
};

const saveData = (name: string, data: any) => {
  fs.writeFileSync(getDataFile(name), JSON.stringify(data, null, 2));
};

// --- AUTHENTICATION ---
app.post('/api/auth/login', (req: Request, res: Response) => {
  const { emailOrUsername, password } = req.body;
  
  // Demo Logic: Match the hardcoded frontend credentials
  if (emailOrUsername === 'yuva00raj@gmail.com' && password === '987654321') {
    res.json({ 
      success: true, 
      requires2FA: true,
      message: 'Initial credentials verified. 2FA required.' 
    });
  } else {
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

// --- USER PROFILE ---
const DEFAULT_PROFILE = {
  firstName: 'Sarah',
  lastName: 'Chen',
  email: 'sarah.chen@uciip.gov',
  department: 'Cyber Crimes Division',
  role: 'Senior Investigator',
  badgeNumber: 'UC-4782',
  clearanceLevel: 'Secret',
  joinDate: '2023-03-15',
  lastLogin: new Date().toISOString(),
  phone: '+1-555-0123',
  emergencyContact: '+1-555-0456'
};

app.get('/api/user/profile', (req: Request, res: Response) => {
  const profile = readData('profile', DEFAULT_PROFILE);
  res.json(profile);
});

app.put('/api/user/profile', (req: Request, res: Response) => {
  const updatedProfile = req.body;
  saveData('profile', updatedProfile);
  res.json({ success: true, profile: updatedProfile });
});

// --- APP SETTINGS ---
const DEFAULT_SETTINGS = {
  mfaEnabled: true,
  sessionTimeout: '30',
  auditLogging: true,
  encryptionLevel: 'aes-256',
  realTimeAlerts: true,
  emailNotifications: true,
  criticalThresholdAlert: true,
  systemStatusNotifications: false,
  apiRateLimit: '1000',
  thirdPartyIntegrations: true,
  autoBackup: true,
  backupFrequency: 'daily',
  theme: 'dark',
  language: 'en',
  dateFormat: 'iso',
  timeZone: 'UTC',
  defaultToolActivation: true,
  autoAnalysis: true,
  riskThreshold: '0.7',
  retentionPeriod: '365'
};

app.get('/api/settings', (req: Request, res: Response) => {
  const settings = readData('settings', DEFAULT_SETTINGS);
  res.json(settings);
});

app.put('/api/settings', (req: Request, res: Response) => {
  const updatedSettings = req.body;
  saveData('settings', updatedSettings);
  res.json({ success: true, settings: updatedSettings });
});

// --- CASE HISTORY ---
const DEFAULT_CASES = [
  {
    id: 'UC-2024-0891',
    title: 'Financial Fraud Investigation',
    description: 'Large-scale cryptocurrency laundering operation detected through suspicious transaction patterns',
    status: 'active',
    priority: 'critical',
    createdAt: '2024-01-15T08:00:00Z',
    updatedAt: '2024-01-15T14:30:00Z',
    assignedTo: 'Agent Sarah Chen',
    evidenceCount: 347,
    toolsUsed: ['Money Mapper', 'AI Security System', 'Social Media Finder'],
    starred: true
  },
  {
    id: 'UC-2024-0890',
    title: 'Phishing Campaign Analysis',
    description: 'Coordinated email phishing attack targeting financial institutions',
    status: 'completed',
    priority: 'high',
    createdAt: '2024-01-14T10:15:00Z',
    updatedAt: '2024-01-15T09:45:00Z',
    assignedTo: 'Agent Mike Torres',
    evidenceCount: 156,
    toolsUsed: ['Email Checker', 'Phishing Detector', 'Fake News Tracker'],
    starred: false
  }
];

app.get('/api/cases', (req: Request, res: Response) => {
  const cases = readData('cases', DEFAULT_CASES);
  res.json(cases);
});

app.post('/api/cases', (req: Request, res: Response) => {
  const cases = readData('cases', DEFAULT_CASES);
  const newCase = {
    ...req.body,
    id: `UC-2024-${Math.floor(1000 + Math.random() * 9000)}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  cases.push(newCase);
  saveData('cases', cases);
  res.json({ success: true, case: newCase });
});

app.put('/api/cases/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const cases = readData('cases', DEFAULT_CASES);
  const index = cases.findIndex((c: any) => c.id === id);
  if (index !== -1) {
    cases[index] = { ...cases[index], ...req.body, updatedAt: new Date().toISOString() };
    saveData('cases', cases);
    res.json({ success: true, case: cases[index] });
  } else {
    res.status(404).json({ success: false, message: 'Case not found' });
  }
});

// --- RECENT FILES ---
const DEFAULT_FILES = [
  { id: '1', name: 'evidence_001.pdf', type: 'PDF', size: '2.4 MB', uploadedBy: 'Agent Chen', date: '2024-01-15' },
  { id: '2', name: 'logs_terminal.txt', type: 'TXT', size: '156 KB', uploadedBy: 'Agent Torres', date: '2024-01-14' },
  { id: '3', name: 'network_capture.pcap', type: 'PCAP', size: '45 MB', uploadedBy: 'Agent Wang', date: '2024-01-15' }
];

app.get('/api/files', (req: Request, res: Response) => {
  const files = readData('files', DEFAULT_FILES);
  res.json(files);
});

// --- HEALTH & STATUS ---
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    message: 'UCIIP Full-Stack System Operational',
    timestamp: new Date().toISOString(),
    version: '1.5.0'
  });
});

app.get('/', (req: Request, res: Response) => {
  res.send('UCIIP Advanced Intelligence Backend is Active');
});

// Start server
app.listen(PORT, () => {
  console.log(`\n--------------------------------------------`);
  console.log(`  UCIIP Full-Stack Backend Active on port ${PORT}`);
  console.log(`  API Base: http://localhost:${PORT}/api`);
  console.log(`--------------------------------------------\n`);
});
