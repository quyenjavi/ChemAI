import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function VerifyPage() {
  return (
    <Card className="max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Xác nhận email</CardTitle>
      </CardHeader>
      <CardContent>
        <p>Đã gửi email xác nhận tới hộp thư của bạn. Vui lòng mở email và bấm vào liên kết xác nhận để kích hoạt tài khoản.</p>
        <p className="mt-2 opacity-80 text-sm">Sau khi xác nhận, hãy quay lại trang đăng nhập để vào sử dụng.</p>
      </CardContent>
    </Card>
  )
}
