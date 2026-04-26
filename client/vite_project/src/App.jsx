import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const MAX_FILE_SIZE = 5 * 1024 * 1024
const SESSIONS_KEY = 'chatSessions'
const ACTIVE_SESSION_KEY = 'activeChatSessionId'
const PROFILE_IMAGE_KEY = 'chatbotProfileImage'

function App() {
  const [sessions, setSessions] = useState(loadSessions)
  const [activeSessionId, setActiveSessionId] = useState(loadActiveSessionId)
  const [profileImage, setProfileImage] = useState(() => localStorage.getItem(PROFILE_IMAGE_KEY) || '')
  const [prompt, setPrompt] = useState('')
  const [status, setStatus] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [voiceEnabled, setVoiceEnabled] = useState(() => {
    return localStorage.getItem('voiceEnabled') === 'true'
  })
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [attachments, setAttachments] = useState([])
  const audioRef = useRef(null)
  const API_URL = "https://aichatbotsite.onrender.com";
  const activeSession = useMemo(() => {
    return sessions.find((session) => session.id === activeSessionId) || sessions[0]
  }, [activeSessionId, sessions])

  const messages = activeSession?.messages || []

  useEffect(() => {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions))
  }, [sessions])

  useEffect(() => {
    if (activeSession?.id) {
      localStorage.setItem(ACTIVE_SESSION_KEY, activeSession.id)
    }
  }, [activeSession?.id])

  useEffect(() => {
    localStorage.setItem('voiceEnabled', String(voiceEnabled))
  }, [voiceEnabled])

  useEffect(() => {
    if (profileImage) {
      localStorage.setItem(PROFILE_IMAGE_KEY, profileImage)
    } else {
      localStorage.removeItem(PROFILE_IMAGE_KEY)
    }
  }, [profileImage])

  async function sendMessage(event) {
    event.preventDefault()

    const content = prompt.trim()
    if ((!content && !attachments.length) || isSending || !activeSession) return

    const userMessage = createUserMessage(content, attachments)
    const nextMessages = [...messages, userMessage]
    updateActiveSession(nextMessages)
    setPrompt('')
    setAttachments([])
    setStatus('Thinking...')
    setIsSending(true)

    try {
      const response = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Chat request failed')
      }

      const finalMessages = [...nextMessages, { role: 'assistant', content: data.reply }]
      updateActiveSession(finalMessages)
      setStatus('')

      if (voiceEnabled) {
        playVoice(data.reply)
      }
    } catch (error) {
      setStatus(error.message)
    } finally {
      setIsSending(false)
    }
  }

  function updateActiveSession(nextMessages) {
    setSessions((current) =>
      current.map((session) => {
        if (session.id !== activeSession.id) return session

        return {
          ...session,
          title: getSessionTitle(nextMessages),
          messages: nextMessages,
          updatedAt: Date.now(),
        }
      }),
    )
  }

  function createSession() {
    stopVoice()
    const session = createDefaultSession()
    setSessions((current) => [session, ...current])
    setActiveSessionId(session.id)
    setPrompt('')
    setAttachments([])
    setStatus('')
  }

  function selectSession(sessionId) {
    stopVoice()
    setActiveSessionId(sessionId)
    setPrompt('')
    setAttachments([])
    setStatus('')
  }

  function deleteSession(sessionId) {
    stopVoice()
    setSessions((current) => {
      const next = current.filter((session) => session.id !== sessionId)
      if (!next.length) {
        const fallback = createDefaultSession()
        setActiveSessionId(fallback.id)
        return [fallback]
      }

      if (sessionId === activeSessionId) {
        setActiveSessionId(next[0].id)
      }

      return next
    })
  }

  function clearChat() {
    stopVoice()
    updateActiveSession([
      {
        role: 'assistant',
        content: 'Chat cleared. Send a new message when you are ready.',
      },
    ])
    setStatus('')
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      event.currentTarget.form.requestSubmit()
    }
  }

  async function handleFilesSelected(event) {
    const selectedFiles = Array.from(event.target.files || [])
    event.target.value = ''

    if (!selectedFiles.length) return

    const loadedFiles = []

    for (const file of selectedFiles) {
      if (file.size > MAX_FILE_SIZE) {
        setStatus(`${file.name} is too large. Maximum file size is 5 MB.`)
        continue
      }

      loadedFiles.push(await readAttachment(file))
    }

    setAttachments((current) => [...current, ...loadedFiles].slice(0, 6))
  }

  async function handleProfileSelected(event) {
    const [file] = Array.from(event.target.files || [])
    event.target.value = ''
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setStatus('Choose an image file for the chatbot profile.')
      return
    }

    if (file.size > MAX_FILE_SIZE) {
      setStatus('Profile image is too large. Maximum file size is 5 MB.')
      return
    }

    const image = await readAsDataUrl(file)
    setProfileImage(image.dataUrl)
    setStatus('')
  }

  async function playVoice(text) {
    stopVoice()
    setIsSpeaking(true)

    try {
      const response = await fetch(`${API_URL}/api/voice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Voice request failed')
      }

      const audioBlob = await response.blob()
      const audioUrl = URL.createObjectURL(audioBlob)
      const audio = new Audio(audioUrl)
      audioRef.current = audio

      audio.addEventListener('ended', () => {
        URL.revokeObjectURL(audioUrl)
        audioRef.current = null
        setIsSpeaking(false)
      })

      audio.addEventListener('error', () => {
        URL.revokeObjectURL(audioUrl)
        audioRef.current = null
        setIsSpeaking(false)
        setStatus('Could not play generated voice.')
      })

      await audio.play()
    } catch (error) {
      setIsSpeaking(false)
      setStatus(error.message)
    }
  }

  function stopVoice() {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      audioRef.current = null
    }
    setIsSpeaking(false)
  }

  function toggleVoice() {
    setVoiceEnabled((enabled) => {
      if (enabled) stopVoice()
      return !enabled
    })
  }

  return (
    <main className="appFrame">
      <aside className="sidebar" aria-label="Chat settings">
        <div className="profileBlock">
          <label className="profileImage" title="Select chatbot profile image">
            <input type="file" accept="image/*" onChange={handleProfileSelected} />
            {profileImage ? <img src={profileImage} alt="Chatbot profile" /> : <span>AI</span>}
          </label>
          <div>
            <p className="eyebrow">OpenRouter</p>
            <h1>AI Chat</h1>
          </div>
        </div>

        <button
          className={`toggleButton ${voiceEnabled ? 'active' : ''}`}
          type="button"
          onClick={toggleVoice}
          aria-pressed={voiceEnabled}
        >
          <span>Voice</span>
          <strong>{voiceEnabled ? 'On' : 'Off'}</strong>
        </button>

        <div className="sidebarStatus">
          {isSpeaking ? 'Speaking now' : 'Voice plays automatically when enabled.'}
        </div>

        <div className="sessionHeader">
          <span>Sessions</span>
          <button type="button" onClick={createSession}>
            New
          </button>
        </div>

        <div className="sessionList">
          {sessions.map((session) => (
            <div className={`sessionRow ${session.id === activeSession?.id ? 'active' : ''}`} key={session.id}>
              <button type="button" onClick={() => selectSession(session.id)}>
                <span>{session.title}</span>
                <small>{formatSessionTime(session.updatedAt)}</small>
              </button>
              <button
                className="deleteSession"
                type="button"
                aria-label={`Delete ${session.title}`}
                onClick={() => deleteSession(session.id)}
              >
                x
              </button>
            </div>
          ))}
        </div>
      </aside>

      <section className="chatPanel" aria-label="AI chat">
        <header className="topbar">
          <div>
            <p className="eyebrow">Current session</p>
            <h2>{activeSession?.title || 'Untitled chat'}</h2>
          </div>
          <button
            className="iconButton"
            type="button"
            title="Clear chat"
            aria-label="Clear chat"
            onClick={clearChat}
          >
            C
          </button>
        </header>

        <div className="messages" aria-live="polite">
          {messages.map((message, index) => (
            <MessageBubble
              message={message}
              profileImage={profileImage}
              key={`${message.role}-${index}`}
            />
          ))}
          {status ? <div className="message assistant status">{status}</div> : null}
        </div>

        {attachments.length ? (
          <div className="attachmentTray" aria-label="Selected attachments">
            {attachments.map((attachment, index) => (
              <div className="attachmentChip" key={`${attachment.name}-${index}`}>
                <span>{attachment.name}</span>
                <button
                  type="button"
                  aria-label={`Remove ${attachment.name}`}
                  onClick={() =>
                    setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))
                  }
                >
                  x
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <form className="composer" onSubmit={sendMessage}>
          <label className="fileButton" title="Upload image or file">
            <input type="file" multiple onChange={handleFilesSelected} />
            File
          </label>
          <label className="srOnly" htmlFor="prompt">
            Message
          </label>
          <textarea
            id="prompt"
            name="prompt"
            rows="1"
            placeholder="Ask your custom AI assistant..."
            autoComplete="off"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button type="submit" disabled={isSending}>
            {isSending ? 'Wait' : 'Send'}
          </button>
        </form>
      </section>
    </main>
  )
}

function MessageBubble({ message, profileImage }) {
  const text = typeof message.content === 'string' ? message.content : getContentText(message.content)

  return (
    <div className={`messageWrap ${message.role}`}>
      {message.role === 'assistant' ? (
        <div className="messageAvatar">
          {profileImage ? <img src={profileImage} alt="" /> : <span>AI</span>}
        </div>
      ) : null}
      <div className={`message ${message.role}`}>
        <span>{text}</span>
        {Array.isArray(message.attachments) && message.attachments.length ? (
          <div className="messageAttachments">
            {message.attachments.map((attachment, index) => (
              <span key={`${attachment.name}-${index}`}>{attachment.name}</span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function loadSessions() {
  try {
    const saved = JSON.parse(localStorage.getItem(SESSIONS_KEY) || '[]')
    const normalized = normalizeSessions(saved)
    if (normalized.length) return normalized
  } catch {
    localStorage.removeItem(SESSIONS_KEY)
  }

  return [createDefaultSession()]
}

function loadActiveSessionId() {
  return localStorage.getItem(ACTIVE_SESSION_KEY) || ''
}

function createDefaultSession() {
  const now = Date.now()

  return {
    id: createId(),
    title: 'New chat',
    createdAt: now,
    updatedAt: now,
    messages: [
      {
        role: 'assistant',
        content: 'Hi. I am connected to your custom assistant. What do you want to work on?',
      },
    ],
  }
}

function normalizeSessions(value) {
  if (!Array.isArray(value)) return []

  return value
    .filter((session) => session && typeof session === 'object')
    .map((session) => {
      const now = Date.now()
      const messages = Array.isArray(session.messages) && session.messages.length
        ? session.messages.filter((message) => {
            return (
              message &&
              ['user', 'assistant'].includes(message.role) &&
              (typeof message.content === 'string' || Array.isArray(message.content))
            )
          })
        : createDefaultSession().messages

      return {
        id: typeof session.id === 'string' && session.id ? session.id : createId(),
        title: typeof session.title === 'string' && session.title ? session.title : getSessionTitle(messages),
        createdAt: Number.isFinite(session.createdAt) ? session.createdAt : now,
        updatedAt: Number.isFinite(session.updatedAt) ? session.updatedAt : now,
        messages: messages.length ? messages : createDefaultSession().messages,
      }
    })
}

function createId() {
  if (crypto?.randomUUID) {
    return crypto.randomUUID()
  }

  return `session-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function getSessionTitle(messages) {
  const userMessage = messages.find((message) => message.role === 'user')
  if (!userMessage) return 'New chat'

  const text =
    typeof userMessage.content === 'string'
      ? userMessage.content
      : getContentText(userMessage.content)

  return text.trim().slice(0, 36) || 'File chat'
}

function formatSessionTime(timestamp) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp)
}

function createUserMessage(text, files) {
  if (!files.length) {
    return { role: 'user', content: text }
  }

  const content = []
  if (text) {
    content.push({ type: 'text', text })
  }

  for (const file of files) {
    if (file.type.startsWith('image/')) {
      content.push({
        type: 'image_url',
        image_url: { url: file.dataUrl },
      })
      continue
    }

    content.push({
      type: 'text',
      text: `Attached file: ${file.name}\nType: ${file.type || 'unknown'}\nContent:\n${file.text}`,
    })
  }

  return {
    role: 'user',
    content,
    attachments: files.map((file) => ({ name: file.name, type: file.type })),
  }
}

function getContentText(content) {
  return content
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
}

function readAttachment(file) {
  if (file.type.startsWith('image/')) {
    return readAsDataUrl(file)
  }

  if (
    file.type.startsWith('text/') ||
    file.name.endsWith('.md') ||
    file.name.endsWith('.json') ||
    file.name.endsWith('.csv') ||
    file.name.endsWith('.yaml') ||
    file.name.endsWith('.yml')
  ) {
    return readAsText(file)
  }

  return Promise.resolve({
    name: file.name,
    type: file.type,
    text: '[Binary file attached. The assistant can see the filename and type only.]',
  })
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () =>
      resolve({
        name: file.name,
        type: file.type,
        dataUrl: reader.result,
        text: '[Image attached]',
      })
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function readAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () =>
      resolve({
        name: file.name,
        type: file.type,
        text: String(reader.result || '').slice(0, 12000),
      })
    reader.onerror = reject
    reader.readAsText(file)
  })
}

export default App
