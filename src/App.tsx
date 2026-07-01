import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Bookshelf from './Bookshelf'
import Reader from './Reader'

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/" element={<Bookshelf />} />
        <Route path="/read/:id" element={<Reader />} />
      </Routes>
    </BrowserRouter>
  )
}
