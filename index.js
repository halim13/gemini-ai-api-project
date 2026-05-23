import {GoogleGenAI} from "@google/genai"
import "dotenv/config"
import express from "express"
import multer from "multer"
import cors from "cors"


const app = express()
const upload = multer()
const ai = new GoogleGenAI({})

const GEMINI_MODEL = "gemini-3.5-flash"

app.use(cors())
app.use(express.json())
app.use(express.static("public"))

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`server ready on http://localhost:${PORT}`))

app.post('/generate-text', async (req, res) => {
  const {prompt} = req.body

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt
    })

    res.status(200).json({result: response.text})
  } catch (error) {
    console.log(error)
    res.status(500).json({message: error.message})
  }
})

app.post('/generate-from-file', upload.any(), async (req, res) => {
  const {prompt} = req.body
  const file = req.files && req.files.length > 0 ? req.files[0] : null

  if (!file) {
    return res.status(400).json({message: "File wajib diunggah."})
  }

  try {
    const base64Data = file.buffer.toString("base64")

    // Tentukan prompt default berdasarkan tipe file (mimetype)
    let defaultPrompt = "Analisis file berikut."
    if (file.mimetype.startsWith("audio/")) {
      defaultPrompt = "Tolong buatkan transkrip dari rekaman berikut."
    } else if (
      file.mimetype.startsWith("application/pdf") ||
      file.mimetype.startsWith("text/") ||
      file.mimetype.includes("document") ||
      file.mimetype.includes("sheet") ||
      file.mimetype.includes("presentation")
    ) {
      defaultPrompt = "Tolong buat ringkasan dari dokumen berikut."
    }

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {text: prompt ?? defaultPrompt, type: "text"},
        {inlineData: {data: base64Data, mimeType: file.mimetype}}
      ]
    })

    res.status(200).json({result: response.text})
  } catch (error) {
    console.log(error)
    res.status(500).json({message: error.message})
  }
})

// Securely expose Firebase client config from env variables to the client
app.get('/api/config', (req, res) => {
  res.status(200).json({
    apiKey: process.env.FIREBASE_API_KEY || "",
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || "",
    projectId: process.env.FIREBASE_PROJECT_ID || "",
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "",
    appId: process.env.FIREBASE_APP_ID || ""
  });
});

app.post('/api/chat', async (req, res) => {
  const {conversation} = req.body

  try {
    if (!Array.isArray(conversation)) throw new Error('Message must be an array!')

    let isValid = true

    conversation.forEach(({role, text}) => {
      if (!isValid) return;

      if (!['model', 'user'].includes(role)) {
        isValid = false;
      }

      if (!text || typeof text !== 'string') {
        isValid = false;
      }
    })

    if (!isValid) {
      return res.status(400).json({message: "payload nggak valid gan!"})
    }

    const contents = conversation.map(({role, text}) => ({
      role, parts: [{text}]
    }))

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents,
      config: {
        temperature: 0.9,
        systemInstruction: `You are a Personal Finance Assistant.

Responsibilities:
* Analyze income and expenses.
* Create monthly budgets.
* Calculate savings ratios.
* Suggest emergency fund targets.
* Explain debt management.
* Explain investment risks.
* Help users plan short-term and long-term finances.
* Always answer in Indonesian.

Rules:
* Never guarantee investment profits.
* Always explain risks.
* Provide calculations when possible.
* Format answers clearly.
* Be educational and practical.`
      }
    })

    res.status(200).json({result: response.text})
  } catch (error) {
    console.log(error)
    res.status(500).json({message: error.message})
  }
})


app.post('/api/chat/conversation', async (req, res) => {
  const {conversation} = req.body

  try {
    const response = await ai.interactions.create({
      model: GEMINI_MODEL,
      input: conversation,
      generation_config: {
        thinking_level: "low",
      }
    })

    res.status(200).json({result: response.text})
  } catch (error) {
    console.log(error)
    res.status(500).json({message: error.message})
  }
})
