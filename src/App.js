import React from 'react';
import { ChatContextProvider } from './context/chatContext';
import SideBar from './components/SideBar';
import NewChatView from './components/NewChatView';

const App = () => {
  return (
    <ChatContextProvider>
      <div className="flex min-h-screen bg-gray-50 dark:bg-gray-900">
        <SideBar />
        <main className="flex-1 ml-16 lg:ml-80 transition-all duration-300">
          <div className="max-w-4xl mx-auto p-4 w-full">
            <NewChatView />
          </div>
        </main>
      </div>
    </ChatContextProvider>
  );
};

export default App;
