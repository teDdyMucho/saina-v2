import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, Calendar, Clock, CheckCircle, XCircle } from 'lucide-react'

const mockAnomalies = [
  {
    id: '1',
    employee: 'Sarah Williams',
    date: '2025-10-16',
    type: 'late',
    details: 'Clocked in 15 minutes late',
    clockIn: '09:15 AM',
    expectedTime: '09:00 AM',
  },
  {
    id: '2',
    employee: 'Mike Johnson',
    date: '2025-10-16',
    type: 'early_out',
    details: 'Clocked out 30 minutes early',
    clockOut: '04:30 PM',
    expectedTime: '05:00 PM',
  },
]

const mockLeaveRequests = [
  {
    id: '1',
    employee: 'John Doe',
    type: 'Annual Leave',
    startDate: '2025-10-25',
    endDate: '2025-10-27',
    days: 3,
    note: 'Family vacation',
    submittedAt: '2025-10-15',
  },
  {
    id: '2',
    employee: 'Jane Smith',
    type: 'Sick Leave',
    startDate: '2025-10-20',
    endDate: '2025-10-20',
    days: 1,
    note: 'Medical appointment',
    submittedAt: '2025-10-16',
  },
]

export function Approvals() {
  const handleApprove = (id: string) => {
    alert(`Approved request ${id}`)
  }

  const handleReject = (id: string) => {
    alert(`Rejected request ${id}`)
  }

  return (
    <div className="space-y-4 md:space-y-6 px-4 sm:px-6 lg:px-10">
      <div>
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Approvals</h2>
        <p className="text-sm md:text-base text-muted-foreground">Review anomalies and leave requests</p>
      </div>

      {/* Anomalies Section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <AlertCircle className="w-4 h-4 md:w-5 md:h-5 text-yellow-600" />
          <h3 className="text-lg md:text-xl font-semibold">Attendance Anomalies</h3>
          <Badge variant="warning" className="text-xs">{mockAnomalies.length} pending</Badge>
        </div>

        {mockAnomalies.map((anomaly) => (
          <Card key={anomaly.id} className="rounded-xl md:rounded-2xl">
            <CardContent className="p-4 md:pt-6">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="space-y-2 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm md:text-base">{anomaly.employee}</span>
                    <Badge
                      variant={anomaly.type === 'late' ? 'warning' : 'destructive'}
                      className="text-xs"
                    >
                      {anomaly.type.replace('_', ' ')}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center gap-2 text-xs md:text-sm text-muted-foreground">
                    <Calendar className="w-3 h-3 flex-shrink-0" />
                    <span>{new Date(anomaly.date).toLocaleDateString()}</span>
                  </div>

                  <p className="text-xs md:text-sm">{anomaly.details}</p>

                  <div className="flex flex-wrap gap-2 md:gap-4 text-xs md:text-sm">
                    {anomaly.clockIn && (
                      <div className="flex items-center gap-1 whitespace-nowrap">
                        <Clock className="w-3 h-3 flex-shrink-0 text-muted-foreground" />
                        <span>Actual: {anomaly.clockIn}</span>
                      </div>
                    )}
                    {anomaly.clockOut && (
                      <div className="flex items-center gap-1 whitespace-nowrap">
                        <Clock className="w-3 h-3 flex-shrink-0 text-muted-foreground" />
                        <span>Actual: {anomaly.clockOut}</span>
                      </div>
                    )}
                    <span className="text-muted-foreground whitespace-nowrap">
                      Expected: {anomaly.expectedTime}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2 w-full sm:w-auto">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleApprove(anomaly.id)}
                    className="flex-1 sm:flex-initial text-xs md:text-sm"
                  >
                    <CheckCircle className="w-3 h-3 md:w-4 md:h-4 mr-1" />
                    <span className="hidden sm:inline">Approve</span>
                    <span className="sm:hidden">✓</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleReject(anomaly.id)}
                    className="flex-1 sm:flex-initial text-xs md:text-sm"
                  >
                    <XCircle className="w-3 h-3 md:w-4 md:h-4 mr-1" />
                    <span className="hidden sm:inline">Flag</span>
                    <span className="sm:hidden">✕</span>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Leave Requests Section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Calendar className="w-4 h-4 md:w-5 md:h-5 text-blue-600" />
          <h3 className="text-lg md:text-xl font-semibold">Leave Requests</h3>
          <Badge className="text-xs">{mockLeaveRequests.length} pending</Badge>
        </div>

        {mockLeaveRequests.map((request) => (
          <Card key={request.id} className="rounded-xl md:rounded-2xl">
            <CardContent className="p-4 md:pt-6">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="space-y-2 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm md:text-base">{request.employee}</span>
                    <Badge variant="secondary" className="text-xs">{request.type}</Badge>
                  </div>
                  
                  <div className="text-xs md:text-sm text-muted-foreground">
                    <span className="block sm:inline">{new Date(request.startDate).toLocaleDateString()} -{' '}
                    {new Date(request.endDate).toLocaleDateString()}</span>
                    <span className="ml-0 sm:ml-2 block sm:inline">
                      ({request.days} day{request.days > 1 ? 's' : ''})
                    </span>
                  </div>

                  {request.note && (
                    <p className="text-xs md:text-sm bg-muted p-2 rounded">
                      <strong>Note:</strong> {request.note}
                    </p>
                  )}

                  <p className="text-xs text-muted-foreground">
                    Submitted: {new Date(request.submittedAt).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex gap-2 w-full sm:w-auto">
                  <Button
                    size="sm"
                    onClick={() => handleApprove(request.id)}
                    className="flex-1 sm:flex-initial text-xs md:text-sm"
                  >
                    <CheckCircle className="w-3 h-3 md:w-4 md:h-4 mr-1" />
                    <span className="hidden sm:inline">Approve</span>
                    <span className="sm:hidden">✓</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleReject(request.id)}
                    className="flex-1 sm:flex-initial text-xs md:text-sm"
                  >
                    <XCircle className="w-3 h-3 md:w-4 md:h-4 mr-1" />
                    <span className="hidden sm:inline">Reject</span>
                    <span className="sm:hidden">✕</span>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
