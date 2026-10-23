import { useEffect, useMemo, useState } from 'react'
import emailjs from '@emailjs/browser'
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  Clock3,
  LoaderCircle,
  MapPin,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { supabase } from './lib/supabase'
import './App.css'

const sampleListingNote = 'Sample listing'

const emailJsConfig = {
  serviceId: import.meta.env.VITE_EMAILJS_SERVICE_ID,
  templateId: import.meta.env.VITE_EMAILJS_TEMPLATE_ID,
  publicKey: import.meta.env.VITE_EMAILJS_PUBLIC_KEY,
}

function formatPrice(price) {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 0,
  }).format(price)
}

function App() {
  const [turfs, setTurfs] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedTurf, setSelectedTurf] = useState(null)
  const [sendingRequest, setSendingRequest] = useState(false)
  const [requestError, setRequestError] = useState('')
  const [requestSent, setRequestSent] = useState(false)

  const today = new Date()
  const minBookingDate = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-')

  useEffect(() => {
    let cancelled = false

    async function loadTurfs() {
      setLoading(true)
      setError('')

      const { data, error: requestError } = await supabase
        .from('turfs')
        .select(
          'id, name, description, city, area, county, hourly_rate_kes, surface, capacity, image_url, is_featured, is_demo',
        )
        .eq('is_active', true)
        .order('is_featured', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(12)

      if (cancelled) return

      if (requestError) {
        setError(requestError.message)
      } else {
        setTurfs(data ?? [])
      }
      setLoading(false)
    }

    loadTurfs()

    return () => {
      cancelled = true
    }
  }, [])

  const filteredTurfs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return turfs

    return turfs.filter((turf) =>
      [turf.name, turf.city, turf.area, turf.county, turf.surface]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery),
    )
  }, [query, turfs])

  const scrollToTurfs = () => {
    document.getElementById('turfs')?.scrollIntoView({ behavior: 'smooth' })
  }

  const openBookingRequest = (turf) => {
    setSelectedTurf(turf)
    setRequestError('')
    setRequestSent(false)
  }

  const closeBookingRequest = () => {
    if (sendingRequest) return
    setSelectedTurf(null)
    setRequestError('')
    setRequestSent(false)
  }

  const sendBookingRequest = async (event) => {
    event.preventDefault()
    if (!selectedTurf || sendingRequest) return

    if (!emailJsConfig.serviceId || !emailJsConfig.templateId || !emailJsConfig.publicKey) {
      setRequestError('Email is not configured. Add the EmailJS service, template, and public key to .env.local, then restart Vite.')
      return
    }

    const formData = new FormData(event.currentTarget)
    if (formData.get('website')) return

    const customerName = String(formData.get('customer_name') ?? '').trim()
    const customerEmail = String(formData.get('customer_email') ?? '').trim()
    const customerPhone = String(formData.get('customer_phone') ?? '').trim()
    const bookingDate = String(formData.get('booking_date') ?? '')
    const bookingTime = String(formData.get('booking_time') ?? '')
    const message = String(formData.get('message') ?? '').trim()

    setSendingRequest(true)
    setRequestError('')

    try {
      await emailjs.send(
        emailJsConfig.serviceId,
        emailJsConfig.templateId,
        {
          turf_name: selectedTurf.name,
          turf_location: `${selectedTurf.area}, ${selectedTurf.city}`,
          turf_hourly_rate: formatPrice(selectedTurf.hourly_rate_kes),
          booking_date: bookingDate,
          booking_time: bookingTime,
          customer_name: customerName,
          customer_email: customerEmail,
          customer_phone: customerPhone,
          reply_to: customerEmail,
          message: message || 'No additional message.',
        },
        {
          publicKey: emailJsConfig.publicKey,
          limitRate: { id: 'pitchside-booking-request', throttle: 10000 },
        },
      )
      setRequestSent(true)
    } catch (sendError) {
      setRequestError(
        sendError instanceof Error
          ? `EmailJS could not send this request: ${sendError.message}`
          : 'EmailJS could not send this request. Check the service, template, and account settings.',
      )
    } finally {
      setSendingRequest(false)
    }
  }

  return (
    <div className="pitch-app">
      <div className="pitch-announcement">
        <span className="pitch-announcement-dot" />
        Nairobi&apos;s home for the beautiful game
        <span className="pitch-announcement-divider">/</span>
        Find your next game
      </div>

      <header className="pitch-header">
        <a className="pitch-logo" href="#home" aria-label="Pitchside home">
          <span className="pitch-logo-mark">P</span>
          <span>PITCH<span className="pitch-logo-light">SIDE</span></span>
        </a>

        <nav className="pitch-nav" aria-label="Main navigation">
          <a href="#turfs">Find a pitch</a>
          <a href="#how-it-works">How it works</a>
        </nav>

        <div className="pitch-header-actions">
          <a className="pitch-owner-link" href="#owner-tools">
            For turf owners <ArrowUpRight size={15} />
          </a>
          <button className="pitch-sign-in" type="button" disabled title="Coming in the next phase">
            Sign in
          </button>
        </div>
      </header>

      <main id="home">
        <section className="pitch-hero">
          <div className="pitch-hero-image" aria-hidden="true" />
          <div className="pitch-hero-content">
            <div className="pitch-eyebrow">
              <span className="pitch-live-dot" />
              The game starts here
            </div>
            <h1>Find your<br />field of play.</h1>
            <p className="pitch-hero-description">
              Discover and book Nairobi&apos;s best football turfs. Your next great game is closer than you think.
            </p>

            <form
              className="pitch-search"
              onSubmit={(event) => {
                event.preventDefault()
                scrollToTurfs()
              }}
            >
              <label className="pitch-search-input">
                <MapPin size={19} aria-hidden="true" />
                <span className="pitch-search-label">
                  <span>Where</span>
                  <input
                    type="search"
                    placeholder="Area or turf name"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    aria-label="Search by area or turf name"
                  />
                </span>
              </label>
              <span className="pitch-search-divider" />
              <div className="pitch-search-when">
                <CalendarDays size={19} aria-hidden="true" />
                <span><strong>When</strong><small>Pick a date soon</small></span>
              </div>
              <button className="pitch-search-button" type="submit" aria-label="Search turfs">
                <Search size={19} />
              </button>
            </form>

            <div className="pitch-trust-row">
              <span><Check size={14} /> Easy booking</span>
              <span><Check size={14} /> Great local turfs</span>
              <span><Check size={14} /> Clear hourly prices</span>
            </div>
          </div>
          <div className="pitch-hero-stamp">
            <span>YOUR</span>
            <strong>GAME</strong>
            <span>AWAITS</span>
            <ArrowDown size={16} />
          </div>
          <div className="pitch-hero-bottom">
            <span>01 — 03</span>
            <span>NAIROBI, KENYA</span>
          </div>
        </section>

        <section className="pitch-benefits" id="how-it-works">
          <div className="pitch-benefit">
            <span className="pitch-benefit-icon"><Search size={19} /></span>
            <div><strong>Find your pitch</strong><span>Explore local grounds</span></div>
          </div>
          <div className="pitch-benefit">
            <span className="pitch-benefit-icon"><CalendarDays size={19} /></span>
            <div><strong>Pick your time</strong><span>Choose a slot that works</span></div>
          </div>
          <div className="pitch-benefit">
            <span className="pitch-benefit-icon"><Check size={19} /></span>
            <div><strong>Play the game</strong><span>Show up ready to play</span></div>
          </div>
          <div className="pitch-benefit-prompt">Three steps.<br />One great game.</div>
        </section>

        <section className="pitch-listings" id="turfs">
          <div className="pitch-section-heading">
            <div>
              <div className="pitch-section-kicker">THE LOCAL LINEUP <span /></div>
              <h2>Good games<br /><em>start here.</em></h2>
            </div>
            <div className="pitch-listing-tools">
              <label className="pitch-listing-search">
                <Search size={17} />
                <input
                  type="search"
                  placeholder="Search Nairobi"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  aria-label="Filter turfs by location, name, or surface"
                />
              </label>
              <span className="pitch-result-count">
                {loading ? 'Loading' : `${filteredTurfs.length} ${filteredTurfs.length === 1 ? 'PITCH' : 'PITCHES'}`}
              </span>
            </div>
          </div>

          {error ? (
            <div className="pitch-state pitch-error" role="alert">
              <h3>We couldn&apos;t load the turf listings.</h3>
              <p>Check that the database setup has been run in Supabase and that your project is reachable.</p>
              <code>{error}</code>
            </div>
          ) : loading ? (
            <div className="pitch-state" role="status">Finding the best local pitches…</div>
          ) : filteredTurfs.length === 0 ? (
            <div className="pitch-state pitch-empty">
              <span className="pitch-empty-icon"><MapPin size={22} /></span>
              <h3>{query ? 'No pitches match that search.' : 'The first whistle is yours.'}</h3>
              <p>
                {query
                  ? 'Try a different area or turf name.'
                  : 'No active turf listings are in the database yet. Run the setup SQL and add your first venue to see it here.'}
              </p>
              {query && <button type="button" onClick={() => setQuery('')}>Clear search</button>}
            </div>
          ) : (
            <div className="pitch-card-grid">
              {filteredTurfs.map((turf, index) => (
                <article className="pitch-card" key={turf.id}>
                  <div className="pitch-card-image">
                    {turf.image_url ? (
                      <img
                        src={turf.image_url}
                        alt={`${turf.name} football turf`}
                        loading={index < 3 ? 'eager' : 'lazy'}
                        onError={(event) => {
                          event.currentTarget.style.display = 'none'
                        }}
                      />
                    ) : (
                      <div className="pitch-image-placeholder"><span>PS</span></div>
                    )}
                    <span className="pitch-card-category">{turf.is_demo ? sampleListingNote : 'REQUEST A SLOT'}</span>
                    {turf.is_featured && <span className="pitch-featured">FEATURED</span>}
                    <button
                      className="pitch-card-arrow"
                      type="button"
                      aria-label={`Request a slot at ${turf.name}`}
                      disabled={turf.is_demo}
                      onClick={() => openBookingRequest(turf)}
                    >
                      <ArrowUpRight size={18} />
                    </button>
                  </div>
                  <div className="pitch-card-details">
                    <div className="pitch-card-location"><MapPin size={14} /> {turf.area}, {turf.city}</div>
                    <h3>{turf.name}</h3>
                    <p className="pitch-card-description">{turf.description || 'A great local place to get the game going.'}</p>
                    <div className="pitch-card-meta">
                      {turf.surface && <span><span className="pitch-meta-dot" />{turf.surface}</span>}
                      {turf.capacity && <span><Users size={14} /> Up to {turf.capacity}</span>}
                      <span><Clock3 size={14} /> Flexible slots</span>
                    </div>
                    <div className="pitch-card-footer">
                      <div><strong>{formatPrice(turf.hourly_rate_kes)}</strong><span> / hour</span></div>
                      <button
                        type="button"
                        className="pitch-book-button"
                        disabled={turf.is_demo}
                        title={turf.is_demo ? 'Sample listing: requests are disabled' : 'Send a booking request'}
                        onClick={() => openBookingRequest(turf)}
                      >
                        {turf.is_demo ? 'Sample only' : 'Request a slot'} <ArrowRight size={15} />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="pitch-owner-cta" id="owner-tools">
          <div className="pitch-owner-cta-icon"><ShieldCheck size={25} /></div>
          <div>
            <span>FOR TURF OWNERS · COMING NEXT</span>
            <h2>Your pitch. More players.</h2>
            <p>Owner accounts and venue management are part of the next build phase.</p>
          </div>
          <a href="#turfs">Explore turfs <ArrowUpRight size={17} /></a>
        </section>
      </main>

      <footer className="pitch-footer">
        <a className="pitch-logo pitch-footer-logo" href="#home">
          <span className="pitch-logo-mark">P</span>
          <span>PITCH<span className="pitch-logo-light">SIDE</span></span>
        </a>
        <span>MADE FOR THE LOVE OF THE GAME.</span>
        <span>NAIROBI, KENYA · KES</span>
      </footer>

      {selectedTurf && (
        <div
          className="pitch-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeBookingRequest()
          }}
        >
          <section
            className="pitch-booking-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pitch-booking-title"
          >
            <button
              className="pitch-modal-close"
              type="button"
              aria-label="Close booking request"
              onClick={closeBookingRequest}
              disabled={sendingRequest}
            >
              ×
            </button>
            {requestSent ? (
              <div className="pitch-request-success" role="status">
                <span className="pitch-empty-icon"><Check size={22} /></span>
                <div className="pitch-section-kicker">REQUEST SENT</div>
                <h2 id="pitch-booking-title">You&apos;re on your way.</h2>
                <p>Your request was emailed. It is not a confirmed booking—the venue must confirm availability.</p>
                <button className="pitch-modal-submit" type="button" onClick={closeBookingRequest}>Done</button>
              </div>
            ) : (
              <>
                <div className="pitch-section-kicker">BOOKING REQUEST <span /></div>
                <h2 id="pitch-booking-title">{selectedTurf.name}</h2>
                <p className="pitch-modal-subtitle">
                  {selectedTurf.area}, {selectedTurf.city} · {formatPrice(selectedTurf.hourly_rate_kes)} / hour
                </p>
                <p className="pitch-modal-notice">
                  This sends a request to the inbox configured in the EmailJS template. Your slot is not reserved until the venue confirms.
                </p>
                <form className="pitch-booking-form" onSubmit={sendBookingRequest}>
                  <div className="pitch-form-row">
                    <label>
                      Date
                      <input name="booking_date" type="date" min={minBookingDate} required />
                    </label>
                    <label>
                      Start time
                      <input name="booking_time" type="time" required />
                    </label>
                  </div>
                  <div className="pitch-form-row">
                    <label>
                      Your name
                      <input name="customer_name" type="text" autoComplete="name" maxLength={100} required />
                    </label>
                    <label>
                      Phone number
                      <input name="customer_phone" type="tel" autoComplete="tel" maxLength={32} required />
                    </label>
                  </div>
                  <label>
                    Email address
                    <input name="customer_email" type="email" autoComplete="email" maxLength={254} required />
                  </label>
                  <label>
                    Message <span className="pitch-form-optional">(optional)</span>
                    <textarea name="message" rows="3" maxLength={1000} placeholder="Anything the venue should know?" />
                  </label>
                  <label className="pitch-honeypot" aria-hidden="true">
                    Leave this field empty
                    <input name="website" type="text" tabIndex="-1" autoComplete="off" />
                  </label>
                  {requestError && <p className="pitch-form-error" role="alert">{requestError}</p>}
                  <button className="pitch-modal-submit" type="submit" disabled={sendingRequest}>
                    {sendingRequest ? <><LoaderCircle size={16} className="pitch-spinner" /> Sending request…</> : <>Send booking request <ArrowRight size={16} /></>}
                  </button>
                </form>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

export default App
