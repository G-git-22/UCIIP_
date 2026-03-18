"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
const DATA_DIR = path_1.default.join(__dirname, '../data');
// Ensure data directory exists
if (!fs_1.default.existsSync(DATA_DIR)) {
    fs_1.default.mkdirSync(DATA_DIR);
}
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// --- Simple Local Persistence Helpers ---
const getDataFile = (name) => path_1.default.join(DATA_DIR, `${name}.json`);
const readData = (name, defaultData) => {
    const file = getDataFile(name);
    if (!fs_1.default.existsSync(file))
        return defaultData;
    try {
        return JSON.parse(fs_1.default.readFileSync(file, 'utf-8'));
    }
    catch (err) {
        return defaultData;
    }
};
const saveData = (name, data) => {
    fs_1.default.writeFileSync(getDataFile(name), JSON.stringify(data, null, 2));
};
// --- AUTHENTICATION ---
app.post('/api/auth/login', (req, res) => {
    const { emailOrUsername, password } = req.body;
    // Demo Logic: Match the hardcoded frontend credentials
    if (emailOrUsername === 'yuva00raj@gmail.com' && password === '987654321') {
        res.json({
            success: true,
            requires2FA: true,
            message: 'Initial credentials verified. 2FA required.'
        });
    }
    else {
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
app.get('/api/user/profile', (req, res) => {
    const profile = readData('profile', DEFAULT_PROFILE);
    res.json(profile);
});
app.put('/api/user/profile', (req, res) => {
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
app.get('/api/settings', (req, res) => {
    const settings = readData('settings', DEFAULT_SETTINGS);
    res.json(settings);
});
app.put('/api/settings', (req, res) => {
    const updatedSettings = req.body;
    saveData('settings', updatedSettings);
    res.json({ success: true, settings: updatedSettings });
});
// --- HEALTH & STATUS ---
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        message: 'UCIIP Full-Stack System Operational',
        timestamp: new Date().toISOString(),
        version: '1.2.0'
    });
});
app.get('/', (req, res) => {
    res.send('UCIIP Advanced Intelligence Backend is Active');
});
// Start server
app.listen(PORT, () => {
    console.log(`\n--------------------------------------------`);
    console.log(`  UCIIP Full-Stack Backend Active on port ${PORT}`);
    console.log(`  API Base: http://localhost:${PORT}/api`);
    console.log(`--------------------------------------------\n`);
});
//# sourceMappingURL=index.js.map