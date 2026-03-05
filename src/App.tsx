import { Routes, Route } from "react-router-dom"

function App() {
  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-200">
      <Routes>
        <Route
          path="/"
          element={
            <div className="flex flex-col items-center justify-center min-h-screen gap-4">
              <h1 className="text-5xl font-bold text-primary">
                GhostCharge
              </h1>
              <p className="text-muted-foreground text-lg">
                Detector de cobranças fantasmas e gerenciador de finanças pessoais
              </p>
              <div className="flex gap-3 mt-4">
                <span className="inline-block w-3 h-3 rounded-full bg-primary animate-pulse" />
                <span className="inline-block w-3 h-3 rounded-full bg-accent animate-pulse delay-100" />
                <span className="inline-block w-3 h-3 rounded-full bg-primary animate-pulse delay-200" />
              </div>
            </div>
          }
        />
      </Routes>
    </div>
  )
}

export default App
