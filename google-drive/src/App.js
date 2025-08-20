import React from 'react';
import Header from './components/Header';
import FileUploadArea from './components/FileUploadArea';
import './index.css';

function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <main className="py-8">
        <FileUploadArea />
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-8 mt-16">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <p className="text-gray-500 text-sm">
            File Upload Showcase with Google Drive Integration
          </p>
          <p className="text-gray-400 text-xs mt-2">
            Built with React + Tailwind CSS
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;