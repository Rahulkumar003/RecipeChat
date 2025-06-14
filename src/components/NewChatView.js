import React, { useState, useRef, useEffect, useContext } from 'react';
import { useParams } from 'react-router-dom';
import ChatMessage from './ChatMessage';
import { ChatContext } from '../context/chatContext';
import { MdSend } from 'react-icons/md';
import { io } from 'socket.io-client';

// //socket connection :
// const socket = io('https://backend-released-recipechat.onrender.com', {
// // const socket = io('https://recipe-chat-backend-532248491422.us-central1.run.app', {

//   transports: ['websocket', 'polling'],
// });

const socket = io('http://192.168.1.203:5000', {
  transports: ['websocket', 'polling'],
});

// Add after socket initialization
socket.on('connect', () => {
  console.log('Connected to backend');
});

socket.on('connect_error', (error) => {
  console.error('Connection error:', error);
});

const NewChatView = () => {
  const { videoUrl } = useParams();
  const messagesEndRef = useRef();
  const inputRef = useRef();
  const [formValue, setFormValue] = useState('');
  const [messages, addMessage] = useContext(ChatContext);
  const [isFetchingRecipe, setIsFetchingRecipe] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentAIMessageId, setCurrentAIMessageId] = useState(null);
  const [loadingMessage, setLoadingMessage] = useState('');

  // Add initial welcome message on component mount (only once)
  useEffect(() => {
    const welcomeMessage = {
      id: `msg_welcome_${Date.now()}`,
      createdAt: Date.now(),
      text: "👋 Welcome to ChatRecipe! Share a YouTube cooking video link, and I'll break down the recipe for you.",
      ai: true,
    };

    addMessage((prevMessages) => (prevMessages.length === 0 ? [welcomeMessage] : prevMessages));
  }, [addMessage]);

  // Auto-fetch recipe if video URL is in route params
  useEffect(() => {
    if (videoUrl && messages.length <= 1) {
      // Only auto-fetch if no conversation has started
      const decodedUrl = decodeURIComponent(videoUrl);

      // Add user message showing the URL
      addMessage({
        id: `msg_user_${Date.now()}`,
        createdAt: Date.now(),
        text: decodedUrl,
        ai: false,
      });

      // Start fetching recipe
      setIsStreaming(true);
      const loadingMessageId = `msg_loading_${Date.now()}`;

      addMessage({
        id: loadingMessageId,
        createdAt: Date.now(),
        text: 'Fetching recipe details...',
        ai: true,
        isLoading: true,
      });
      setLoadingMessage(loadingMessageId);

      socket.emit('fetch_recipe_stream', { video_url: decodedUrl });
    }
  }, [videoUrl, messages.length, addMessage]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Enhanced socket event listener
  useEffect(() => {
    const handleResponse = (data) => {
      console.log('Received response:', data);

      if (data.error) {
        console.error('Socket error:', data.error);

        if (loadingMessage) {
          addMessage((prevMessages) => prevMessages.filter((msg) => msg.id !== loadingMessage));
        }

        addMessage({
          id: `msg_error_${Date.now()}`,
          createdAt: Date.now(),
          text: `Error: ${data.error}`,
          ai: true,
        });
        setIsStreaming(false);
        setCurrentAIMessageId(null);
        setLoadingMessage('');
      } else if (data.complete) {
        setIsStreaming(false);
        setCurrentAIMessageId(null);
        setIsFetchingRecipe(false);
      } else if (data.streaming) {
        if (loadingMessage) {
          addMessage((prevMessages) => prevMessages.filter((msg) => msg.id !== loadingMessage));
          setLoadingMessage('');
        }

        addMessage((prevMessages) => {
          if (!currentAIMessageId) {
            const newMessageId = `msg_stream_${Date.now()}`;
            setCurrentAIMessageId(newMessageId);
            return [
              ...prevMessages,
              {
                id: newMessageId,
                createdAt: Date.now(),
                text: data.data,
                ai: true,
                complete: false,
              },
            ];
          }

          return prevMessages.map((msg) =>
            msg.id === currentAIMessageId
              ? {
                  ...msg,
                  text: (msg.text || '') + data.data,
                }
              : msg,
          );
        });
        scrollToBottom();
      }
    };

    socket.on('response', handleResponse);
    return () => socket.off('response', handleResponse);
  }, [currentAIMessageId, loadingMessage, addMessage]);

  // Recipe stream listener
  useEffect(() => {
    const handleRecipeStream = (data) => {
      console.log('Received recipe chunk:', data);

      if (data.error) {
        console.error('Recipe fetch error:', data.error);

        if (loadingMessage) {
          addMessage((prevMessages) => prevMessages.filter((msg) => msg.id !== loadingMessage));
        }

        addMessage({
          id: `msg_error_${Date.now()}`,
          createdAt: Date.now(),
          text: `Error fetching recipe: ${data.error}`,
          ai: true,
        });
        setIsStreaming(false);
        setCurrentAIMessageId(null);
        setLoadingMessage('');
      } else if (data.complete) {
        setIsStreaming(false);
        setIsFetchingRecipe(false);
        setCurrentAIMessageId(null);
      } else if (data.streaming) {
        if (loadingMessage) {
          addMessage((prevMessages) => prevMessages.filter((msg) => msg.id !== loadingMessage));
          setLoadingMessage('');
        }

        addMessage((prevMessages) => {
          if (!currentAIMessageId) {
            const newMessageId = `msg_recipe_${Date.now()}`;
            setCurrentAIMessageId(newMessageId);
            return [
              ...prevMessages,
              {
                id: newMessageId,
                createdAt: Date.now(),
                text: data.data,
                ai: true,
                complete: false,
              },
            ];
          }

          return prevMessages.map((msg) =>
            msg.id === currentAIMessageId
              ? {
                  ...msg,
                  text: (msg.text || '') + data.data,
                }
              : msg,
          );
        });
        scrollToBottom();
      }
    };

    socket.on('recipe_stream', handleRecipeStream);
    return () => socket.off('recipe_stream', handleRecipeStream);
  }, [currentAIMessageId, loadingMessage, addMessage]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formValue) return;

    const cleanInput = formValue.trim();
    setFormValue('');

    addMessage({
      id: `msg_user_${Date.now()}`,
      createdAt: Date.now(),
      text: cleanInput,
      ai: false,
    });

    setIsStreaming(true);
    const loadingText = isFetchingRecipe ? 'Fetching recipe details...' : 'Generating response...';
    const loadingMessageId = `msg_loading_${Date.now()}`;

    addMessage({
      id: loadingMessageId,
      createdAt: Date.now(),
      text: loadingText,
      ai: true,
      isLoading: true,
    });
    setLoadingMessage(loadingMessageId);

    if (isFetchingRecipe) {
      socket.emit('fetch_recipe_stream', { video_url: cleanInput });
    } else {
      socket.emit('generate_text', { prompt: cleanInput });
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isStreaming) handleSubmit(e);
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    inputRef.current.focus();
  }, []);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 min-h-[calc(100vh-2rem)] flex flex-col max-w-3xl mx-auto">
      <main className="flex-grow overflow-y-auto space-y-4 mb-4">
        {messages.map((message) => (
          <ChatMessage key={message.id} message={message} />
        ))}
        <span ref={messagesEndRef}></span>
      </main>

      <form
        onSubmit={handleSubmit}
        className="sticky bottom-0 bg-white dark:bg-gray-800 pt-4 border-t border-gray-200 dark:border-gray-700"
      >
        <div className="flex items-stretch bg-gray-50 dark:bg-gray-700 rounded-xl overflow-hidden">
          <textarea
            ref={inputRef}
            className="w-full p-3 bg-transparent text-gray-800 dark:text-gray-200 outline-none resize-none max-h-32"
            rows={1}
            value={formValue}
            onKeyDown={handleKeyDown}
            onChange={(e) => setFormValue(e.target.value)}
            placeholder={
              isStreaming
                ? 'Answer is being generated...'
                : isFetchingRecipe
                ? 'Enter YouTube video URL'
                : 'Ask a question'
            }
            disabled={isStreaming}
          />
          <button
            type="submit"
            className={`p-3 ${
              formValue && !isStreaming
                ? 'text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900'
                : 'text-gray-400'
            } transition-colors`}
            disabled={!formValue || isStreaming}
          >
            <MdSend size={24} />
          </button>
        </div>
      </form>
    </div>
  );
};

export default NewChatView;
