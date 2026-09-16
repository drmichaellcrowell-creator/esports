import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { OperationExecutorProvider } from './application/react'
import { createProductionOperationExecutor } from './infrastructure/base44'

// The one place the production substrate is chosen. Everything below this
// point sees an OperationExecutor and never Base44. Swapping substrates, or
// injecting a fake in a test, is a different value passed here — not a change
// to any component.
const executor = createProductionOperationExecutor()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <OperationExecutorProvider executor={executor}>
      <App />
    </OperationExecutorProvider>
  </React.StrictMode>,
)
