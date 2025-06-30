import React, { useState, useEffect } from 'react';

// Ensure proper mobile viewport scaling
if (typeof document !== 'undefined') {
  const metaViewport = document.querySelector('meta[name="viewport"]');
  if (!metaViewport) {
    const meta = document.createElement('meta');
    meta.name = 'viewport';
    meta.content = 'width=device-width, initial-scale=1';
    document.head.appendChild(meta);
  }
}
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ChatContextProvider } from './context/chatContext';
import SideBar from './components/SideBar';
import NewChatView from './components/NewChatView';

const App = () => {
  // State to track if sidebar is open - initial state based on screen size
  const [isSidebarOpen, setSidebarOpen] = useState(window.innerWidth >= 768);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // Update layout on window resize
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      setSidebarOpen(!mobile); // Open on desktop, closed on mobile
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <Router>
      <ChatContextProvider>
        <div className="relative flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900 md:flex-row">
          {/* SideBar component with toggle callback */}
          <SideBar isOpen={isSidebarOpen} setIsOpen={setSidebarOpen} isMobile={isMobile} />

          {/* Main content */}
          <main
            className={`flex-1 transition-all duration-300 w-full ${
              isMobile ? 'ml-0' : isSidebarOpen ? 'md:ml-64 lg:ml-72' : 'md:ml-16'
            }`}
          >
            <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 md:px-8 py-6 md:py-8">
              <Routes>
                <Route path="/" element={<NewChatView />} />
                <Route path="/:videoUrl" element={<NewChatView />} />
              </Routes>
            </div>
          </main>
        </div>
      </ChatContextProvider>
    </Router>
  );
};

export default App;
