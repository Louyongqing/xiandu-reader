import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (this.state.failed)
      return (
        <div className="fatal-error">
          <h2>页面暂时没有打开</h2>
          <p>重新打开应用再试一次，本地书架会保留。</p>
          <button className="primary-button" onClick={() => window.location.reload()}>
            重新打开
          </button>
        </div>
      )
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
)
