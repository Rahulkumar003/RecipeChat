import React, { useState, useContext } from 'react';
import { MdChevronLeft, MdChevronRight, MdAdd, MdOutlineSettings } from 'react-icons/md';
import { ChatContext } from '../context/chatContext';
import logo from '../assets/logo.png';
import Modal from './Modal';
import Setting from './Setting';

const SideBar = ({ isOpen, setIsOpen, isMobile }) => {
  const [, , clearMessages] = useContext(ChatContext);
  const [modalOpen, setModalOpen] = useState(false);

  const clearChat = () => {
    clearMessages();
    // Close sidebar on mobile after starting new chat for better UX
    if (isMobile) {
      setIsOpen(false);
    }
  };

  // Toggle sidebar
  const toggleSidebar = () => {
    setIsOpen((prevState) => !prevState);
  };

  // Close sidebar when clicking overlay on mobile
  const handleOverlayClick = () => {
    if (isMobile && isOpen) {
      setIsOpen(false);
    }
  };

  return (
    <>
      {/* Dark overlay when sidebar is open on mobile */}
      {isMobile && isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30"
          onClick={handleOverlayClick}
          aria-hidden="true"
        />
      )}

      <aside
        className={`
          bg-white 
          dark:bg-gray-800 
          h-screen 
          fixed 
          left-0 
          top-0 
          z-40 
          shadow-lg 
          border-r 
          border-gray-200 
          dark:border-gray-700 
          transition-all 
          duration-300 
          ${isMobile ? (isOpen ? 'translate-x-0' : '-translate-x-full') : 'translate-x-0'}
          ${isOpen ? 'w-56 md:w-64 lg:w-72' : isMobile ? 'w-0' : 'w-16'}
          overflow-hidden
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div
            className={`flex items-center transition-all ${
              !isOpen ? 'opacity-0 w-0' : 'opacity-100'
            }`}
          >
            <img src={logo} alt="RecipeHelper Logo" className="w-9 h-9 mr-2 rounded-full" />
            <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-200">ChatRecipe</h1>
          </div>

          <button
            onClick={toggleSidebar}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label={isOpen ? 'Close sidebar' : 'Open sidebar'}
          >
            {isOpen ? (
              <MdChevronLeft className="w-6 h-6 text-gray-600 dark:text-gray-300" />
            ) : (
              <MdChevronRight className="w-6 h-6 text-gray-600 dark:text-gray-300" />
            )}
          </button>
        </div>

        {/* New Chat Button */}
        <div className="p-2 mt-4">
          <button
            onClick={clearChat}
            className={`
              w-full 
              border 
              border-gray-200 
              dark:border-gray-700 
              rounded-lg 
              flex 
              items-center 
              p-2 
              cursor-pointer 
              hover:bg-gray-100 
              dark:hover:bg-gray-700 
              transition-colors 
              group
            `}
          >
            <div className="p-2 bg-blue-50 dark:bg-blue-900 rounded-full mr-2">
              <MdAdd className="w-5 h-5 text-blue-600 dark:text-blue-300" />
            </div>
            <span
              className={`
              text-gray-800 
              dark:text-gray-200 
              ${!isOpen && 'hidden'}
              group-hover:text-blue-600 
              dark:group-hover:text-blue-300 
              transition-colors
            `}
            >
              New Chat
            </span>
          </button>
        </div>

        {/* Settings */}
        <div className="absolute bottom-0 left-0 right-0 p-2">
          <div
            onClick={() => {
              setModalOpen(true);
              setIsOpen(true);
            }}
            className="cursor-pointer"
          >
            <div
              className={`
                flex 
                items-center 
                p-2 
                rounded-lg 
                hover:bg-gray-100 
                dark:hover:bg-gray-700 
                transition-colors 
                group
              `}
            >
              <div className="p-2 bg-gray-50 dark:bg-gray-900 rounded-full mr-2">
                <MdOutlineSettings className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              </div>
              <span
                className={`
                text-gray-800 
                dark:text-gray-200 
                ${!isOpen && 'hidden'}
                group-hover:text-blue-600 
                dark:group-hover:text-blue-300 
                transition-colors
              `}
              >
                Settings
              </span>
            </div>
          </div>
        </div>

        {/* Settings Modal */}
        <Modal title="Settings" modalOpen={modalOpen} setModalOpen={setModalOpen}>
          <Setting modalOpen={modalOpen} setModalOpen={setModalOpen} />
        </Modal>
      </aside>

      {/* Mobile Toggle Button - Fixed at top left corner on small screens */}
      {isMobile && !isOpen && (
        <button
          onClick={toggleSidebar}
          className="fixed top-3 left-3 z-50 bg-blue-600 text-white p-2 rounded-full shadow-xl border-2 border-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-transform duration-150 hover:scale-110 active:scale-95"
          aria-label="Open sidebar"
          style={{ boxShadow: '0 4px 16px 0 rgba(0,0,0,0.25)' }}
        >
          <MdChevronRight className="w-6 h-6" />
        </button>
      )}
    </>
  );
};

export default SideBar;
