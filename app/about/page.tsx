export default function AboutPage() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="text-center space-y-3">
        <div className="text-sm" style={{color:'var(--text-muted)'}}>
          Đang mở trang giới thiệu…
        </div>
        <div className="flex items-center justify-center gap-3">
          <a href="/introduce.html" className="underline" style={{color:'var(--gold)'}}>
            Mở Giới thiệu ChemAI
          </a>
          <a href="/login" className="underline" style={{color:'var(--gold)'}}>
            Đăng nhập
          </a>
        </div>
      </div>
    </div>
  )
}

