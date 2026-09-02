const fs = require('fs');
let code = fs.readFileSync('src/services/aiService.js', 'utf-8');

const oldGemini = /export async function callGeminiAi\\(prompt, apiKey = ''\\) \\{[\\s\\S]*?data: \\{\\s*contents: \\[\\{ parts: \\[\\{ text: prompt \\}\\] \\}\\]\\s*\\}/;

const newGemini = `export async function callGeminiAi(prompt, systemPrompt = '', apiKey = '') {
  const key = apiKey || localStorage.getItem('nepse_hub_gemini_api_key') || import.meta.env.VITE_GEMINI_API_KEY || '';
  if (!key) throw new Error('No Gemini API key configured');

  const data = {
    contents: [{ parts: [{ text: prompt }] }]
  };
  
  if (systemPrompt) {
    data.systemInstruction = { parts: [{ text: systemPrompt }] };
  }

  const res = await executeHttpRequest({
    url: \`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=\${key.trim()}\`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: data`;

code = code.replace(oldGemini, newGemini);

// And update the dispatcher to pass systemPrompt to Gemini
code = code.replace("const text = await callGeminiAi(prompt);", "const text = await callGeminiAi(prompt, systemPrompt, customKey);");
code = code.replace("const text = await callGroqAi(prompt, systemPrompt);", "const text = await callGroqAi(prompt, systemPrompt, customKey);");

fs.writeFileSync('src/services/aiService.js', code);
console.log('Fixed Gemini system prompt mapping');
