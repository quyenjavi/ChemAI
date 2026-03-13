'use client'
 
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
 
export default function MaintenancePage() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <Card className="max-w-xl w-full">
        <CardHeader>
          <CardTitle>Bảo trì hệ thống</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-[15px]" style={{ color: 'var(--text-secondary)' }}>
            Hệ thống đang trong quá trình nâng cấp. Vui lòng quay lại sau.
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => location.reload()}>
              Thử lại
            </Button>
            <a href="/login">
              <Button>Đăng nhập</Button>
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

