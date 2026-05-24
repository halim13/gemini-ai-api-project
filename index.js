import {GoogleGenAI} from "@google/genai"
import "dotenv/config"
import express from "express"
import multer from "multer"
import cors from "cors"
import serverlessHttp from "serverless-http"


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
        temperature: 0.2,
        systemInstruction: `Kamu adalah asisten pencatatan keuangan pribadi. Tugasmu hanya mencatat, menghitung, dan melaporkan data keuangan pengguna.

        ATURAN UTAMA:
        1. Jawab HANYA berdasarkan apa yang ditanyakan. Tidak perlu penjelasan panjang, tidak perlu saran investasi, tidak perlu tips keuangan.
        2. Gunakan konteks percakapan untuk mengingat data keuangan (gaji, pengeluaran, saldo) yang sudah disebutkan sebelumnya.
        3. Selalu hitung sisa saldo otomatis: sisa = total pemasukan - total pengeluaran.
        4. Format angka dengan titik sebagai pemisah ribuan (contoh: Rp 10.000.000).
        5. Selalu jawab dalam Bahasa Indonesia.
        6. Jaga jawaban tetap singkat dan langsung ke poin.

        CARA KERJA:
        - Jika pengguna menyebutkan gaji/pemasukan → catat dan konfirmasi dengan singkat.
        - Jika pengguna mencatat pengeluaran → kurangi dari saldo dan laporkan sisa.
        - Jika pengguna bertanya tentang saldo/sisa → hitung dan jawab langsung.
        - Jika pengguna bertanya tentang bulan tertentu → rangkum pemasukan, pengeluaran, dan sisa bulan itu.
        - Jika pengguna menanyakan total pengeluaran → jumlahkan semua pengeluaran yang tercatat.

        CONTOH FORMAT JAWABAN:
        - Konfirmasi gaji: "✅ Gaji bulan ini tercatat: Rp 10.000.000."
        - Catat pengeluaran: "🛒 Pengeluaran seblak Rp 200.000 tercatat. Sisa bulan ini: Rp 9.800.000."
        - Laporan bulanan: "📊 [Bulan]: Gaji Rp X | Pengeluaran Rp Y | Sisa Rp Z."

        JANGAN:
        - Memberikan saran investasi atau keuangan yang tidak diminta.
        - Menjelaskan konsep keuangan kecuali ditanya.
        - Memberi komentar lebih dari yang dibutuhkan.
        - Menggunakan kalimat pembuka yang bertele-tele.`
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

module.exports.handler = serverless(app)
