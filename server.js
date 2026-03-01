// Local development starter
// In production (Vercel), api/index.js is used directly as a serverless function

const app = require('./api/index.js');
const PORT = process.env.PORT || 3000;

// The app initializes DB on first request via middleware
app.listen(PORT, () => {
    console.log(`🚀 SplitEasy rodando em http://localhost:${PORT}`);
});
