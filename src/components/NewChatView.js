import React, { useState, useRef, useEffect, useContext } from 'react';
import { useParams } from 'react-router-dom';
import ChatMessage from './ChatMessage';
import { ChatContext } from '../context/chatContext';
import { MdSend, MdStop } from 'react-icons/md';
import { io } from 'socket.io-client';

const NewChatView = () => {
  const { videoUrl } = useParams();
  const messagesEndRef = useRef();
  const inputRef = useRef();
  const socketRef = useRef(null);
  const [formValue, setFormValue] = useState('');
  const [messages, addMessage] = useContext(ChatContext);
  const [isFetchingRecipe, setIsFetchingRecipe] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentAIMessageId, setCurrentAIMessageId] = useState(null);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [isRecipeFetchInProgress, setIsRecipeFetchInProgress] = useState(false);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [hasStoppedGeneration, setHasStoppedGeneration] = useState(false);
  const [isStoppingInProgress, setIsStoppingInProgress] = useState(false);
  const [currentMessageId, setCurrentMessageId] = useState(null);

  // Function to clean text formatting
  const cleanText = (text) => {
    return text
      .replace(/\n{3,}/g, '\n\n') // Replace 3+ consecutive line breaks with just 2
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join('\n');
  };

  // Scroll to bottom when messages change IF AUTO-SCROLL is enabled
  useEffect(() => {
    if (shouldAutoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, shouldAutoScroll]);

  // Check if user is near bottom of chat
  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    // isNearBottom = user is within 100px of bottom
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    setShouldAutoScroll(isNearBottom);
  };

  // Stop streaming - user forced stop - with reconnect approach
  const handleStop = () => {
    setIsStoppingInProgress(true);
    console.log('Stop requested - attempting to halt stream');

    if (socketRef.current) {
      // Send stop signal with the messageId received from the server
      socketRef.current.emit('stop_stream', { messageId: currentMessageId || currentAIMessageId });
      console.log(
        `Stop signal sent to server for message: ${currentMessageId || currentAIMessageId}`,
      );
    }

    // Mark as stopped to block incoming messages
    setHasStoppedGeneration(true);
    setIsStreaming(false);
    setCurrentAIMessageId(null);
    setCurrentMessageId(null);
    setIsFetchingRecipe(false);
    setIsRecipeFetchInProgress(false);
    setLoadingMessage('');

    // Clean up message display
    addMessage((prevMessages) => {
      return prevMessages
        .map((msg) => {
          if (msg.id === currentAIMessageId && msg.ai && !msg.complete) {
            // Mark message as complete when stopped, trim trailing newlines
            return {
              ...msg,
              text: cleanText((msg.text || '').trim()) + '\n\n[Generation stopped by user]',
              complete: true,
              stopped: true,
            };
          }
          return msg;
        })
        .filter((msg) => !msg.isLoading);
    });

    // Reset stopped state after a delay
    setTimeout(() => {
      setHasStoppedGeneration(false);
      setIsStoppingInProgress(false);
    }, 500);
  };

  // Initialize socket connection once
  useEffect(() => {
    if (!socketRef.current) {
      socketRef.current = io('http://192.168.47.23:5000', {
        transports: ['websocket', 'polling'],
      });

      socketRef.current.on('connect', () => {
        console.log('Connected to backend');
      });

      socketRef.current.on('connect_error', (error) => {
        console.error('Connection error:', error);
      });
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

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
    if (videoUrl && messages.length <= 1 && !isRecipeFetchInProgress && socketRef.current) {
      // Only auto-fetch if no conversation has started
      setIsRecipeFetchInProgress(true);
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

      socketRef.current.emit('fetch_recipe_stream', { video_url: decodedUrl });
    }
  }, [videoUrl, messages.length, addMessage, isRecipeFetchInProgress]);

  // Enhanced socket event listener
  useEffect(() => {
    if (!socketRef.current) return;

    const handleResponse = (data) => {
      console.log('Received response:', data);

      // Track messageId from the server
      if (data.messageId && !currentMessageId) {
        setCurrentMessageId(data.messageId);
      }

      // Server acknowledged our stop request
      if (data.stopped) {
        setIsStreaming(false);
        setIsStoppingInProgress(false);
        return;
      }

      // Block all incoming messages if we're in the process of stopping
      if (isStoppingInProgress) {
        console.log('Ignoring data - stop in progress');
        return;
      }

      // Ignore incoming data if stop was pressed
      if (hasStoppedGeneration) {
        console.log('Ignoring incoming data after stop');
        return;
      }

      if (data.error) {
        console.error('Socket error:', data.error);

        // Clear loading message
        addMessage((prevMessages) => {
          return prevMessages.filter((msg) => !msg.isLoading);
        });
        setLoadingMessage('');

        addMessage({
          id: `msg_error_${Date.now()}`,
          createdAt: Date.now(),
          text: `Error: ${data.error}`,
          ai: true,
        });
        setIsStreaming(false);
        setCurrentAIMessageId(null);
        setIsFetchingRecipe(false);
        setIsRecipeFetchInProgress(false);
      } else if (data.complete) {
        // Clear loading message and clean final text
        addMessage((prevMessages) => {
          return prevMessages
            .map((msg) => {
              if (msg.id === currentAIMessageId) {
                return {
                  ...msg,
                  text: cleanText(msg.text || ''),
                  complete: true,
                };
              }
              return msg;
            })
            .filter((msg) => !msg.isLoading);
        });
        setLoadingMessage('');
        setIsStreaming(false);
        setCurrentAIMessageId(null);
        setIsFetchingRecipe(false);
        setIsRecipeFetchInProgress(false);
      } else if (data.streaming) {
        // Clear loading message on first streaming data
        if (loadingMessage) {
          addMessage((prevMessages) => {
            return prevMessages.filter((msg) => !msg.isLoading);
          });
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
      }
    };

    const socket = socketRef.current;
    socket.on('response', handleResponse);
    socket.on('recipe_stream', handleResponse);

    // Listen for stop_acknowledged from server
    socket.on('stop_acknowledged', (data) => {
      console.log('Stop acknowledged by server:', data);
      // Server confirmed it stopped generation
      setIsStreaming(false);
      setCurrentAIMessageId(null);
      setCurrentMessageId(null);
      setIsStoppingInProgress(false);
    });

    return () => {
      if (socket) {
        socket.off('response', handleResponse);
        socket.off('recipe_stream', handleResponse);
        socket.off('stop_acknowledged');
      }
    };
  }, [
    currentAIMessageId,
    currentMessageId,
    loadingMessage,
    addMessage,
    hasStoppedGeneration,
    isStoppingInProgress,
  ]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formValue || !socketRef.current) return;

    const cleanInput = formValue.trim();
    setFormValue('');

    // Reset auto-scroll when user sends a message
    setShouldAutoScroll(true);

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

    if (isFetchingRecipe && !isRecipeFetchInProgress) {
      setIsRecipeFetchInProgress(true);
      socketRef.current.emit('fetch_recipe_stream', { video_url: cleanInput });
    } else {
      socketRef.current.emit('generate_text', { prompt: cleanInput });
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isStreaming) handleSubmit(e);
    }
  };

  // Only scroll on initial load, not on every message change
  useEffect(() => {
    inputRef.current.focus();
  }, []);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 min-h-[calc(100vh-2rem)] flex flex-col max-w-3xl mx-auto">
      <main className="flex-grow overflow-y-auto space-y-4 mb-4" onScroll={handleScroll}>
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
          {!isStreaming ? (
            <button
              type="submit"
              className={`p-3 ${
                formValue
                  ? 'text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900'
                  : 'text-gray-400'
              } transition-colors`}
              disabled={!formValue || isStoppingInProgress}
            >
              <MdSend size={24} />
            </button>
          ) : (
            <button
              type="button"
              className={`p-3 flex items-center justify-center rounded-r ${
                isStoppingInProgress ? 'bg-gray-500' : 'bg-red-500 hover:bg-red-600'
              } text-white transition-colors`}
              onClick={handleStop}
              disabled={isStoppingInProgress}
              title={isStoppingInProgress ? 'Stopping...' : 'Stop Generating'}
            >
              {isStoppingInProgress ? (
                <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
              ) : (
                <MdStop size={24} />
              )}
            </button>
          )}
        </div>
      </form>
    </div>
  );
};

export default NewChatView;
