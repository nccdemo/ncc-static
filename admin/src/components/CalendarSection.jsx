import { useCallback, useEffect, useMemo, useState } from 'react'
import { Calendar, dateFnsLocalizer } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay } from 'date-fns'
import { enUS } from 'date-fns/locale/en-US'
import 'react-big-calendar/lib/css/react-big-calendar.css'

import api from '../api/axios.js'

const locales = { 'en-US': enUS }

/** Matches backend calendar_router._TOUR_EVENT_ID_OFFSET */
const TOUR_EVENT_ID_OFFSET = 50_000_000

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
})

function toYmd(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function CalendarSection() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [viewDate, setViewDate] = useState(() => new Date())
  const [calView, setCalView] = useState('month')

  const loadRange = useCallback(async (from, to) => {
    setLoading(true)
    setError('')
    try {
      const { data } = await api.get('/calendar', {
        params: { from: toYmd(from), to: toYmd(to) },
      })
      const list = Array.isArray(data) ? data : []
      setEvents(
        list.map((e) => ({
          id: e.id,
          title: e.title,
          start: new Date(e.start),
          end: new Date(e.end),
          driver_id: e.driver_id,
          kind: Number(e.id) >= TOUR_EVENT_ID_OFFSET ? 'tour' : 'trip',
        })),
      )
    } catch (err) {
      console.error(err)
      setEvents([])
      setError(err?.response?.data?.detail || err?.message || 'Could not load calendar')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let start
    let end
    if (calView === 'month' || calView === 'agenda') {
      start = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1)
      end = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0)
    } else if (calView === 'week') {
      const d = new Date(viewDate)
      const day = d.getDay()
      start = new Date(d)
      start.setDate(d.getDate() - day)
      end = new Date(start)
      end.setDate(start.getDate() + 6)
    } else {
      start = new Date(viewDate)
      start.setHours(0, 0, 0, 0)
      end = new Date(viewDate)
      end.setHours(23, 59, 59, 999)
    }
    loadRange(start, end)
  }, [viewDate, calView, loadRange])

  const onNavigate = useCallback((nextDate) => {
    setViewDate(nextDate)
  }, [])

  const eventPropGetter = useCallback((ev) => {
    if (ev.kind === 'tour') {
      return { style: { backgroundColor: '#7c3aed', borderColor: '#6d28d9', color: '#fff' } }
    }
    return { style: { backgroundColor: '#2563eb', borderColor: '#1d4ed8', color: '#fff' } }
  }, [])

  const messages = useMemo(
    () => ({
      today: 'Today',
      previous: 'Back',
      next: 'Next',
      month: 'Month',
      week: 'Week',
      day: 'Day',
      agenda: 'Agenda',
    }),
    [],
  )

  return (
    <section className="panel calendar-panel">
      <div className="panel-head">
        <h2>Schedule</h2>
        <p className="muted" style={{ margin: 0 }}>
          Trips (blue) and tours (purple). Use month/week/day views.
        </p>
      </div>

      <div className="calendar-legend">
        <span className="calendar-legend-item trip">Trip</span>
        <span className="calendar-legend-item tour">Tour</span>
      </div>

      {loading && <p className="muted">Loading calendar…</p>}
      {error && <p className="banner calendar-error">{String(error)}</p>}

      <div className="calendar-wrap" style={{ minHeight: 560 }}>
        <Calendar
          localizer={localizer}
          culture="en-US"
          events={events}
          startAccessor="start"
          endAccessor="end"
          titleAccessor="title"
          views={['month', 'week', 'day', 'agenda']}
          view={calView}
          onView={setCalView}
          date={viewDate}
          onNavigate={onNavigate}
          eventPropGetter={eventPropGetter}
          messages={messages}
          popup
        />
      </div>
    </section>
  )
}
