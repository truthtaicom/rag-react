import { useState, useRef, useCallback, FormEvent, useEffect } from 'react'
import { ToastContainer, toast } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import { Send, Upload } from 'lucide-react'
import { ChatWindowMessage } from '@/schema/ChatWindowMessage'

function App() {
  const [isLoading, setIsLoading] = useState(false)
  const [selectedPDF, setSelectedPDF] = useState<File | null>(null)
  const [messages, setMessages] = useState<ChatWindowMessage[]>([])
  const [input, setInput] = useState('')
  const worker = useRef<Worker | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const initProgressToastId = useRef<Id | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    if (!worker.current) {
      worker.current = new Worker(new URL('../worker.ts', import.meta.url), {
        type: 'module',
      })
      
      worker.current.addEventListener('message', handleWorkerMessage)
    }

    return () => {
      worker.current?.removeEventListener('message', handleWorkerMessage)
    }
  }, [])

  const handleWorkerMessage = async (e: MessageEvent) => {
    console.log("Received worker message:", e.data);
    switch (e.data.type) {
      case "log":
        console.log("Worker log:", e.data)
        break
      case "error":
        setIsLoading(false)
        toast(`Error: ${e.data.error}`, { theme: "dark" })
        break
      case "init_progress":
        if (initProgressToastId.current === null) {
          initProgressToastId.current = toast(
            "Loading model weights... This may take a while",
            {
              progress: e.data.data.progress || 0.01,
              theme: "dark"
            }
          );
        } else {
          if (e.data.data.progress === 1) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
          toast.update(initProgressToastId.current, { progress: e.data.data.progress || 0.01 });
        }
        break
      case "complete":
        console.log("Received complete message:", e.data);
        if (e.data.message) {
          setIsLoading(false)
          setMessages(prev => [...prev, e.data.message])
        } else {
          console.error("Received complete message without content:", e.data);
          toast("Received empty response from AI", { theme: "dark" });
        }
        break
      default:
        console.log("Unknown message type:", e.data.type);
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedPDF(e.target.files[0])
    }
  }

  const handleUpload = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!selectedPDF) {
      toast('Please select a file first', { theme: "dark" })
      return
    }

    setIsLoading(true)
    const aiMessage: ChatWindowMessage = { role: "assistant", content: `Processing document: ${selectedPDF.name}...` }
    setMessages(prev => [...prev, aiMessage])

    const blob = new Blob([selectedPDF], { type: selectedPDF.type })
    worker.current?.postMessage({ 
      pdf: blob, 
      type: "embed",
    })
  }

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!input.trim()) return

    const newHumanMessage: ChatWindowMessage = { role: "user", content: input }
    const newMessages = [...messages, newHumanMessage]
    setMessages(newMessages)
    worker.current?.postMessage({ 
      type: "query",
      messages: newMessages
    })
    
    setInput('')
    setIsLoading(true)
  }

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-gray-900 to-gray-800">
      <div className="flex-1 overflow-hidden">
        <div className="container mx-auto h-full flex flex-col max-w-4xl">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                } animate-fade-in`}
              >
                <div
                  className={`max-w-[70%] rounded-2xl p-4 shadow-lg backdrop-blur-sm ${
                    message.role === 'user'
                      ? 'bg-blue-600 bg-opacity-90 text-white'
                      : message.role === 'assistant'
                      ? 'bg-gray-700 bg-opacity-90 text-gray-100'
                      : 'bg-white bg-opacity-90 text-gray-800'
                  } transform transition-all duration-200 hover:scale-[1.02]`}
                >
                  <p className="text-sm leading-relaxed">{message.content.toString()}</p>
                  {/* <span className="text-xs opacity-70 mt-2 block">
                    {new Date(message.timestamp).toLocaleTimeString()}
                  </span> */}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 border-t border-gray-700 bg-gray-800 bg-opacity-90 backdrop-blur-sm rounded-t-2xl">
            <form onSubmit={handleUpload} className="mb-4">
              <div className="flex items-center space-x-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".pdf"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-xl flex items-center space-x-2 text-gray-100 transition-colors duration-200"
                >
                  <Upload className="w-4 h-4" />
                  <span>{selectedPDF ? selectedPDF.name : 'Choose PDF'}</span>
                </button>
                <button
                  type="submit"
                  disabled={!selectedPDF || isLoading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600 transition-colors duration-200"
                >
                  Upload
                </button>
              </div>
            </form>

            <form onSubmit={handleSubmit} className="flex space-x-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your message..."
                disabled={isLoading}
                className="flex-1 px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-100 placeholder-gray-400 transition-all duration-200"
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600 transition-colors duration-200 flex items-center space-x-2"
              >
                <Send className="w-4 h-4" />
                <span>Send</span>
              </button>
            </form>
          </div>
        </div>
      </div>
      <ToastContainer 
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="dark"
      />
    </div>
  )
}

export default App
