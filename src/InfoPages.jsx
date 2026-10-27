// ── FOOTER INFO PAGES ─────────────────────────────────────────────────
// About Vai · How it works · Districts · Guides (blog) · Help center ·
// Contact us · Privacy policy · Terms. One full-screen sheet, opened from
// the footer links (each has its own shareable link: #about, #privacy …),
// lazy-loaded so it costs nothing until someone opens it.
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { getProviderDirectory, submitSupportMessage } from "./supabase";

export const INFO_PAGES = ["about", "how-it-works", "districts", "blog", "help", "contact", "privacy", "terms"];
const DISTRICT_LIST = ["Belize City", "Cayo", "Corozal", "Orange Walk", "Stann Creek", "Toledo"];
const UPDATED = { en: "October 27, 2026", es: "27 de octubre de 2026" };

const TITLES = {
  en: { about: "About Vai", "how-it-works": "How it works", districts: "Districts", blog: "Blog", help: "Help center", contact: "Contact us", privacy: "Privacy policy", terms: "Terms of use" },
  es: { about: "Sobre Vai", "how-it-works": "Cómo funciona", districts: "Distritos", blog: "Blog", help: "Centro de ayuda", contact: "Contáctanos", privacy: "Política de privacidad", terms: "Términos de uso" },
};

// ---------- small building blocks ----------
function Section({ title, children }) {
  return (
    <section className="ip-sec">
      {title && <h2>{title}</h2>}
      {children}
    </section>
  );
}
function Steps({ items }) {
  return (
    <ol className="ip-steps">
      {items.map(([h, p], i) => (
        <li key={i}><span className="ip-step-n">{i + 1}</span><div><strong>{h}</strong><p>{p}</p></div></li>
      ))}
    </ol>
  );
}
function Faq({ items, open, setOpen, prefix }) {
  return (
    <div className="ip-faq">
      {items.map(([q, a], i) => {
        const id = `${prefix}-${i}`;
        const isOpen = open === id;
        return (
          <div key={id} className={`ip-faq-item ${isOpen ? "open" : ""}`}>
            <button onClick={() => setOpen(isOpen ? null : id)} aria-expanded={isOpen}>
              <span>{q}</span><span className="ip-faq-chev" aria-hidden="true">{isOpen ? "−" : "+"}</span>
            </button>
            {isOpen && <div className="ip-faq-a">{a}</div>}
          </div>
        );
      })}
    </div>
  );
}

// ---------- content ----------
const C = {
  en: {
    back: "Back",
    more: "More from VaiBook",
    about: {
      lead: "VaiBook makes it easy to find and book local services in Belize — barbers, salons, nail techs, spas, therapists, trainers and more — and gives the people who run those businesses a simple way to manage their day.",
      blocks: [
        ["Why we built it", "Booking in Belize still runs on phone calls, DMs and \"are you free Saturday?\" messages that get lost. Customers wait for replies, businesses lose track of who's coming, and no-shows cost real money. VaiBook puts the whole thing in one place: real availability, instant requests, reminders and a clear record of every appointment."],
        ["For customers", "See real prices, photos and open times, book in under a minute, and keep all your appointments, receipts and favourite places in one account. No app store download needed — add VaiBook to your home screen and it works like an app."],
        ["For businesses", "A booking page you can share anywhere, a calendar that syncs to your phone, booking alerts, deposits, client history, monthly insights and a Belize-ready sales and tax ledger — built for how small businesses here actually work."],
        ["Part of Vai Plaza", "VaiBook is a product of Vai Plaza, a family of local platforms built in Belize, alongside Vai Buy for buying and selling."],
      ],
      ctaFind: "Find a service", ctaList: "List your business",
    },
    how: {
      cTitle: "For customers",
      c: [
        ["Find a business", "Search by service or name, or pick your district to see who's close to you."],
        ["Pick a service and a time", "You only see times the business is actually open and free."],
        ["Send your request", "The business confirms it. If they ask for a deposit, you send it and upload the receipt — your spot is held once they confirm the payment."],
        ["Get reminded and show up", "You'll get an alert when it's confirmed and before your appointment. Need to change plans? Cancel or reschedule from My bookings."],
      ],
      bTitle: "For businesses",
      b: [
        ["Apply", "Tell us about your business. Every application is reviewed by our team before it goes live."],
        ["Set up your page", "Add your services and prices, opening hours, photos and a short bio. Choose whether you want a deposit."],
        ["Share your link", "Put your booking link in your Instagram bio, WhatsApp status or print your \"Scan to book\" poster."],
        ["Run your day", "Accept requests with one tap, add walk-ins, block time off, sync to your phone calendar and see what's working in Monthly insights."],
      ],
      ctaFind: "Find a service", ctaList: "List your business",
    },
    districts: {
      lead: "VaiBook covers all six districts of Belize. Tap a business to see its services and book.",
      businesses: (n) => `${n} business${n === 1 ? "" : "es"}`,
      none: "No businesses here yet. Know a great local business? Send them to VaiBook — or tell us about them.",
      tellUs: "Suggest a business",
      loading: "Loading businesses…",
      book: "Book",
    },
    blog: {
      lead: "Short, practical guides for booking and for running your business on VaiBook.",
      tagC: "For customers", tagB: "For businesses",
      posts: [
        { tag: "c", title: "How to book on VaiBook in under a minute", body: [
          "Open VaiBook and search for what you need, or choose your district to see who's nearby.",
          "Open a business to see its services, prices, photos and reviews. Tap a service to select it — you can pick more than one.",
          "Choose a day from the strip (closed days are greyed out) and tap a free time.",
          "Add your name and number and send the request. You'll be told right away if the business needs a deposit first.",
          "Watch for the confirmation alert. Everything — times, receipts, messages — stays in My bookings.",
        ] },
        { tag: "c", title: "Put VaiBook on your phone's home screen", body: [
          "iPhone: open vai-book.vercel.app in Safari, tap the Share button, then \"Add to Home Screen\".",
          "Android: open it in Chrome, tap the ⋮ menu, then \"Add to Home screen\" or \"Install app\".",
          "Open VaiBook from the new icon and allow notifications so you get booking confirmations and reminders.",
        ] },
        { tag: "b", title: "5 ways to cut no-shows", body: [
          "Ask for a deposit. Even a small one makes people far more likely to turn up — turn it on in Settings → Deposits.",
          "Answer requests fast. Clients who wait hours often book somewhere else and forget to cancel. Turn on phone alerts so you see requests right away.",
          "Write a clear cancellation policy on your page, for example \"Please cancel at least 24 hours ahead\".",
          "Mark no-shows honestly. Monthly insights then shows you who misses appointments repeatedly, so you can ask them to pay ahead.",
          "Keep regulars coming back with rebook reminders instead of chasing new strangers.",
        ] },
        { tag: "b", title: "Get your business page ready to take bookings", body: [
          "Add every service with a real price and a realistic duration — durations decide which times customers can pick.",
          "Set your opening hours. Customers can only book inside them.",
          "Upload at least 3 photos of your work. Pages with photos get far more taps.",
          "Write a short bio: who you are, where you are, and what you're best at.",
          "Share your link everywhere: Instagram bio, WhatsApp status, and a printed \"Scan to book\" poster at your counter.",
        ] },
        { tag: "b", title: "Your monthly Belize tax figures, ready in one tap", body: [
          "Open Earnings → Belize tax filing and pick the month.",
          "Choose your business type so VaiBook applies the right Business Tax rate on your gross receipts, and tick GST if you're registered.",
          "Download the CSV or print the ledger and take it to your accountant or use it to fill in your return. Returns are due by the 15th of the next month.",
          "This is a helper, not tax advice — check your figures with the Belize Tax Service or your accountant.",
        ] },
      ],
      read: "Read", close: "Close",
    },
    help: {
      search: "Search help…",
      noResults: "No answers matched. Try other words, or contact us below.",
      cTitle: "Customers",
      c: [
        ["Do I need an account to book?", "You can open any business link without an account. To send a booking you'll add your name and contact details so the business knows who's coming; with an account you can also see all your bookings, favourites and receipts in one place."],
        ["When is my booking confirmed?", "When the business accepts it — you'll get an alert. If the business asks for a deposit, your booking is confirmed once they've checked your payment receipt."],
        ["How do I pay a deposit?", "The booking shows the business's payment details. Send the deposit, then upload a photo of the receipt on the booking. Payments go straight to the business, not to VaiBook."],
        ["How do I cancel or change a booking?", "Go to My bookings, open the booking and tap Cancel, or ask the business to propose a new time. Please cancel as early as you can — deposits are refunded according to each business's own policy."],
        ["I'm not getting notifications.", "Add VaiBook to your home screen, open it from there, and turn on notifications in Settings. On iPhone, notifications only work when VaiBook is opened from the home-screen icon."],
        ["How do I delete my account?", "Go to Settings → Danger Zone → Request Account Deletion. We'll confirm with you before anything is deleted."],
      ],
      bTitle: "Businesses",
      b: [
        ["How do I list my business?", "Tap \"For business\" and fill in the application. Our team reviews every application before the business goes live, and we'll contact you with the next steps."],
        ["How do I get alerts for new bookings?", "Open VaiBook from your home screen, go to Settings → Notifications and turn on alerts for this device. Each phone you use needs to be turned on once."],
        ["Can bookings go into my Google or iPhone calendar?", "Yes. Settings → Notifications → Calendar sync gives you a private link. Add it to Google Calendar (\"From URL\") or your iPhone (Settings → Calendar → Accounts → Add subscribed calendar). New bookings appear automatically."],
        ["How do I take a walk-in or phone booking?", "On your home screen tap Walk-in or Appointment, pick the service and a free time, and add the client's name."],
        ["Where's my booking link and QR poster?", "Tap Share link on your home screen. You can share to WhatsApp, Facebook or Instagram, copy the link, or download a printable \"Scan to book\" poster."],
        ["Does VaiBook file my taxes?", "No — Earnings → Belize tax filing prepares your monthly gross receipts, Business Tax and GST figures and a ledger you can download or print. You still file with the Belize Tax Service yourself or through your accountant."],
      ],
      still: "Still stuck?", contact: "Contact us",
    },
    contact: {
      lead: "Questions, problems, or want your business on VaiBook? Send us a message and we'll get back to you.",
      name: "Your name", contactField: "Email or WhatsApp number", topic: "Topic", message: "Message",
      topics: [["general", "General question"], ["booking", "Problem with a booking"], ["business", "Listing my business"], ["account", "My account"], ["bug", "Something isn't working"], ["other", "Other"]],
      send: "Send message", sending: "Sending…",
      sent: "Thanks — your message is in. We'll reply to the email or WhatsApp number you gave.",
      error: "Couldn't send that. Please check your connection and try again.",
      rate: "You've sent several messages in a short time. Please wait a little and try again.",
      missing: "Please fill in your name, how to reach you, and a message.",
      another: "Send another message",
    },
    privacy: {
      intro: "This policy explains what information VaiBook collects, why, who can see it, and the choices you have. VaiBook is operated from Belize by Vai Plaza.",
      sections: [
        ["Information we collect", [
          "Account details: your name, email address and, if you add them, your phone or WhatsApp number and profile photo. If you sign in with Google we receive your name, email and profile picture from Google.",
          "Booking details: the business, services, date and time you book, notes you add, messages with the business, deposit receipts you upload, and the booking's status.",
          "Reviews you write, and businesses you save as favourites.",
          "For businesses: business name and details, services and prices, opening hours, photos, staff, payment instructions and booking records.",
          "Device information needed to run the service, such as a notification subscription for your device if you turn alerts on.",
          "Location: only if you tap \"Use my current location\", and only to sort businesses by distance on your device. We don't store your location.",
        ]],
        ["How we use it", [
          "To create and manage bookings and show them to you and the business you booked with.",
          "To send booking alerts, reminders and messages you've asked for.",
          "To keep VaiBook secure, prevent abuse and fix problems.",
          "To answer messages you send us.",
          "We do not sell your personal information, and we don't use it for third-party advertising.",
        ]],
        ["Who can see your information", [
          "The business you book with sees your name, contact details, booking details, notes and any receipt you upload, so they can serve you.",
          "Reviews are public and show your name and profile photo.",
          "Our service providers, which store and deliver data on our behalf: Supabase (database and sign-in), Vercel (website hosting), Google (if you choose Google sign-in) and the push-notification services of your phone or browser.",
          "Authorities, if we're required to by law.",
        ]],
        ["How long we keep it", [
          "We keep your account information while your account is open. Booking records are kept so that businesses can meet their record-keeping and tax obligations, which in Belize can be up to six years.",
          "When you ask us to delete your account we remove or anonymise your personal information, except what we must keep by law.",
        ]],
        ["Your choices", [
          "You can update your details in Settings at any time.",
          "You can turn notifications off in Settings or in your phone's settings.",
          "You can ask for a copy of your information, ask us to correct it, or ask us to delete your account — use Settings → Danger Zone or contact us.",
        ]],
        ["Security", [
          "Your data is protected with access rules so each person and business only sees what they need. No system is perfectly secure, so please keep your password private and tell us right away if you think your account has been misused.",
        ]],
        ["Children", [
          "VaiBook is meant for people 18 and older. A parent or guardian can book on behalf of a child.",
        ]],
        ["Changes", [
          "If we change this policy we'll update the date at the top, and tell you in the app if the change is significant.",
        ]],
      ],
    },
    terms: {
      intro: "These terms apply when you use VaiBook, whether you're booking a service or running a business on it. By using VaiBook you agree to them.",
      sections: [
        ["What VaiBook is", [
          "VaiBook is a booking platform. It connects customers with independent local businesses. The services themselves are provided by those businesses, not by VaiBook, and each business is responsible for its own services, prices, policies and conduct.",
        ]],
        ["Your account", [
          "Give accurate information and keep your login details private. You're responsible for what happens on your account.",
          "We may suspend or close accounts that break these terms, misuse the platform, or put other people at risk.",
        ]],
        ["Bookings", [
          "A booking request is not confirmed until the business accepts it, or — where a deposit is required — until the business confirms your payment.",
          "Please turn up on time and cancel as early as possible if you can't make it. Repeated no-shows may lead businesses to require deposits from you or decline your requests.",
          "Businesses may decline, reschedule or cancel bookings, and should tell you as soon as possible when they do.",
        ]],
        ["Payments, deposits and refunds", [
          "Payments and deposits are made directly to the business using the details it provides. VaiBook doesn't hold your money.",
          "Refunds are handled by the business under its own policy. If you can't resolve a problem with a business, contact us and we'll try to help, but we can't guarantee an outcome.",
        ]],
        ["Rules for businesses", [
          "Keep your services, prices, hours and photos accurate and honour the bookings you accept.",
          "Only upload photos and content you have the right to use.",
          "Use customers' information only to provide and manage their bookings, and keep it private.",
          "You're responsible for your own licences, taxes and legal obligations. VaiBook's tax tools are a convenience, not tax or legal advice.",
          "Subscription fees, if any, are shown before you're charged.",
        ]],
        ["Reviews and content", [
          "Reviews must be honest and based on a real visit. We may remove content that is false, abusive, discriminatory, or breaks the law.",
          "By posting content on VaiBook you let us display it on the platform.",
        ]],
        ["Things you must not do", [
          "Don't make fake bookings or reviews, harass anyone, try to access other people's accounts or data, interfere with how VaiBook works, or use it for anything illegal.",
        ]],
        ["Our responsibility", [
          "We work to keep VaiBook running and accurate, but it's provided \"as is\" and may sometimes be unavailable or contain mistakes.",
          "To the extent the law allows, VaiBook isn't responsible for the services businesses provide, for disputes between customers and businesses, or for indirect losses.",
        ]],
        ["Law and changes", [
          "These terms are governed by the laws of Belize.",
          "We may update these terms. If we make an important change we'll let you know in the app; continuing to use VaiBook after that means you accept the updated terms.",
        ]],
      ],
    },
    updated: "Last updated",
    questions: "Questions about this page?",
  },
  es: {
    back: "Atrás",
    more: "Más de VaiBook",
    about: {
      lead: "VaiBook hace fácil encontrar y reservar servicios locales en Belice — barberos, salones, uñas, spas, terapeutas, entrenadores y más — y les da a quienes manejan esos negocios una forma sencilla de organizar su día.",
      blocks: [
        ["Por qué lo creamos", "Reservar en Belice todavía depende de llamadas, mensajes directos y \"¿tienes espacio el sábado?\" que se pierden. Los clientes esperan respuestas, los negocios pierden la cuenta de quién viene y las ausencias cuestan dinero. VaiBook lo junta todo en un lugar: disponibilidad real, solicitudes al instante, recordatorios y un registro claro de cada cita."],
        ["Para clientes", "Mira precios reales, fotos y horarios libres, reserva en menos de un minuto y guarda tus citas, recibos y lugares favoritos en una sola cuenta. No hace falta descargar nada — agrega VaiBook a tu pantalla de inicio y funciona como una app."],
        ["Para negocios", "Una página de reservas para compartir en cualquier lugar, un calendario que se sincroniza con tu teléfono, alertas de reservas, depósitos, historial de clientes, resumen mensual y un libro de ventas e impuestos listo para Belice — hecho para cómo trabajan aquí los pequeños negocios."],
        ["Parte de Vai Plaza", "VaiBook es un producto de Vai Plaza, una familia de plataformas locales creadas en Belice, junto con Vai Buy para comprar y vender."],
      ],
      ctaFind: "Buscar un servicio", ctaList: "Registrar mi negocio",
    },
    how: {
      cTitle: "Para clientes",
      c: [
        ["Encuentra un negocio", "Busca por servicio o nombre, o elige tu distrito para ver quién está cerca."],
        ["Elige el servicio y la hora", "Solo ves las horas en que el negocio está abierto y libre."],
        ["Envía tu solicitud", "El negocio la confirma. Si pide depósito, lo envías y subes el recibo — tu espacio queda apartado cuando confirman el pago."],
        ["Recibe recordatorios y llega", "Recibirás una alerta cuando se confirme y antes de tu cita. ¿Cambio de planes? Cancela o cambia la hora desde Mis reservas."],
      ],
      bTitle: "Para negocios",
      b: [
        ["Aplica", "Cuéntanos sobre tu negocio. Nuestro equipo revisa cada solicitud antes de publicarla."],
        ["Arma tu página", "Agrega servicios y precios, horario, fotos y una breve descripción. Elige si quieres pedir depósito."],
        ["Comparte tu enlace", "Ponlo en tu bio de Instagram, tu estado de WhatsApp o imprime tu póster \"Escanea para reservar\"."],
        ["Maneja tu día", "Acepta solicitudes con un toque, agrega clientes sin cita, bloquea horas, sincroniza tu calendario y mira qué funciona en el resumen mensual."],
      ],
      ctaFind: "Buscar un servicio", ctaList: "Registrar mi negocio",
    },
    districts: {
      lead: "VaiBook cubre los seis distritos de Belice. Toca un negocio para ver sus servicios y reservar.",
      businesses: (n) => `${n} negocio${n === 1 ? "" : "s"}`,
      none: "Aún no hay negocios aquí. ¿Conoces un buen negocio local? Invítalo a VaiBook — o cuéntanos de él.",
      tellUs: "Sugerir un negocio",
      loading: "Cargando negocios…",
      book: "Reservar",
    },
    blog: {
      lead: "Guías cortas y prácticas para reservar y para manejar tu negocio en VaiBook.",
      tagC: "Para clientes", tagB: "Para negocios",
      posts: [
        { tag: "c", title: "Cómo reservar en VaiBook en menos de un minuto", body: [
          "Abre VaiBook y busca lo que necesitas, o elige tu distrito para ver quién está cerca.",
          "Abre un negocio para ver servicios, precios, fotos y reseñas. Toca un servicio para elegirlo — puedes elegir más de uno.",
          "Elige un día en la barra (los días cerrados aparecen en gris) y toca una hora libre.",
          "Agrega tu nombre y número y envía la solicitud. Te avisamos de inmediato si el negocio pide depósito.",
          "Espera la alerta de confirmación. Todo — horas, recibos, mensajes — queda en Mis reservas.",
        ] },
        { tag: "c", title: "Pon VaiBook en la pantalla de inicio de tu teléfono", body: [
          "iPhone: abre vai-book.vercel.app en Safari, toca Compartir y luego \"Agregar a inicio\".",
          "Android: ábrelo en Chrome, toca el menú ⋮ y luego \"Agregar a la pantalla principal\" o \"Instalar app\".",
          "Abre VaiBook desde el nuevo ícono y permite las notificaciones para recibir confirmaciones y recordatorios.",
        ] },
        { tag: "b", title: "5 formas de reducir las ausencias", body: [
          "Pide un depósito. Aunque sea pequeño, la gente llega mucho más — actívalo en Ajustes → Depósitos.",
          "Responde rápido. Los clientes que esperan horas reservan en otro lado y olvidan cancelar. Activa las alertas para ver las solicitudes al momento.",
          "Escribe una política de cancelación clara, por ejemplo \"Cancela con al menos 24 horas\".",
          "Marca las ausencias. El resumen mensual te muestra quién falta seguido, para pedirles pagar por adelantado.",
          "Haz que tus habituales regresen con recordatorios en lugar de buscar siempre clientes nuevos.",
        ] },
        { tag: "b", title: "Prepara tu página para recibir reservas", body: [
          "Agrega cada servicio con su precio real y una duración realista — la duración decide qué horas pueden elegir.",
          "Pon tu horario. Los clientes solo pueden reservar dentro de él.",
          "Sube al menos 3 fotos de tu trabajo. Las páginas con fotos reciben muchas más visitas.",
          "Escribe una breve descripción: quién eres, dónde estás y en qué eres mejor.",
          "Comparte tu enlace en todas partes: bio de Instagram, estado de WhatsApp y un póster impreso en tu mostrador.",
        ] },
        { tag: "b", title: "Tus cifras de impuestos de Belice, listas con un toque", body: [
          "Abre Ganancias → Declaración de impuestos de Belice y elige el mes.",
          "Elige tu tipo de negocio para aplicar la tasa correcta del Impuesto Empresarial sobre ingresos brutos, y marca GST si estás registrado.",
          "Descarga el CSV o imprime el libro y llévalo a tu contador o úsalo para llenar tu declaración. Vence el día 15 del mes siguiente.",
          "Es una ayuda, no asesoría fiscal — verifica tus cifras con el Belize Tax Service o tu contador.",
        ] },
      ],
      read: "Leer", close: "Cerrar",
    },
    help: {
      search: "Buscar ayuda…",
      noResults: "No encontramos respuestas. Prueba otras palabras o contáctanos abajo.",
      cTitle: "Clientes",
      c: [
        ["¿Necesito una cuenta para reservar?", "Puedes abrir el enlace de cualquier negocio sin cuenta. Para enviar una reserva agregas tu nombre y contacto para que el negocio sepa quién viene; con una cuenta además ves tus reservas, favoritos y recibos en un solo lugar."],
        ["¿Cuándo queda confirmada mi reserva?", "Cuando el negocio la acepta — recibirás una alerta. Si el negocio pide depósito, se confirma cuando revisan tu recibo de pago."],
        ["¿Cómo pago un depósito?", "La reserva muestra los datos de pago del negocio. Envía el depósito y sube una foto del recibo en la reserva. El pago va directo al negocio, no a VaiBook."],
        ["¿Cómo cancelo o cambio una reserva?", "Ve a Mis reservas, abre la reserva y toca Cancelar, o pide al negocio que proponga otra hora. Cancela lo antes posible — los depósitos se reembolsan según la política de cada negocio."],
        ["No me llegan las notificaciones.", "Agrega VaiBook a tu pantalla de inicio, ábrelo desde ahí y activa las notificaciones en Ajustes. En iPhone solo funcionan si abres VaiBook desde el ícono."],
        ["¿Cómo elimino mi cuenta?", "Ve a Ajustes → Zona de peligro → Solicitar eliminación de cuenta. Te confirmaremos antes de borrar nada."],
      ],
      bTitle: "Negocios",
      b: [
        ["¿Cómo registro mi negocio?", "Toca \"Para negocios\" y llena la solicitud. Nuestro equipo revisa cada solicitud antes de publicar el negocio y te contactamos con los siguientes pasos."],
        ["¿Cómo recibo alertas de nuevas reservas?", "Abre VaiBook desde tu pantalla de inicio, ve a Ajustes → Notificaciones y activa las alertas en este dispositivo. Cada teléfono se activa una vez."],
        ["¿Las reservas pueden ir a mi calendario de Google o iPhone?", "Sí. Ajustes → Notificaciones → Sincronizar calendario te da un enlace privado. Agrégalo en Google Calendar (\"Desde URL\") o en tu iPhone (Ajustes → Calendario → Cuentas → Agregar calendario suscrito). Las reservas nuevas aparecen solas."],
        ["¿Cómo agrego un cliente sin cita o por teléfono?", "En tu inicio toca Sin cita o Cita, elige el servicio y una hora libre, y agrega el nombre del cliente."],
        ["¿Dónde está mi enlace y mi póster QR?", "Toca Compartir enlace en tu inicio. Puedes compartir por WhatsApp, Facebook o Instagram, copiar el enlace o descargar un póster \"Escanea para reservar\"."],
        ["¿VaiBook declara mis impuestos?", "No — Ganancias → Declaración de impuestos de Belice prepara tus ingresos brutos, Impuesto Empresarial, GST y un libro para descargar o imprimir. La declaración la haces tú o tu contador ante el Belize Tax Service."],
      ],
      still: "¿Sigues con dudas?", contact: "Contáctanos",
    },
    contact: {
      lead: "¿Preguntas, problemas o quieres tu negocio en VaiBook? Escríbenos y te responderemos.",
      name: "Tu nombre", contactField: "Correo o número de WhatsApp", topic: "Tema", message: "Mensaje",
      topics: [["general", "Pregunta general"], ["booking", "Problema con una reserva"], ["business", "Registrar mi negocio"], ["account", "Mi cuenta"], ["bug", "Algo no funciona"], ["other", "Otro"]],
      send: "Enviar mensaje", sending: "Enviando…",
      sent: "Gracias — recibimos tu mensaje. Te responderemos al correo o WhatsApp que nos diste.",
      error: "No se pudo enviar. Revisa tu conexión e inténtalo de nuevo.",
      rate: "Enviaste varios mensajes en poco tiempo. Espera un poco e inténtalo otra vez.",
      missing: "Escribe tu nombre, cómo contactarte y un mensaje.",
      another: "Enviar otro mensaje",
    },
    privacy: {
      intro: "Esta política explica qué información recopila VaiBook, para qué, quién la ve y qué opciones tienes. VaiBook opera desde Belice y es de Vai Plaza.",
      sections: [
        ["Información que recopilamos", [
          "Datos de cuenta: tu nombre, correo y, si los agregas, tu teléfono o WhatsApp y foto de perfil. Si entras con Google, recibimos tu nombre, correo y foto de Google.",
          "Datos de reservas: el negocio, servicios, fecha y hora, notas, mensajes con el negocio, recibos de depósito que subas y el estado de la reserva.",
          "Las reseñas que escribes y los negocios que guardas como favoritos.",
          "Para negocios: nombre y datos del negocio, servicios y precios, horario, fotos, personal, instrucciones de pago y registros de reservas.",
          "Información del dispositivo necesaria para el servicio, como la suscripción de notificaciones si activas las alertas.",
          "Ubicación: solo si tocas \"Usar mi ubicación actual\", y solo para ordenar negocios por distancia en tu dispositivo. No guardamos tu ubicación.",
        ]],
        ["Cómo la usamos", [
          "Para crear y manejar reservas y mostrarlas a ti y al negocio.",
          "Para enviar las alertas, recordatorios y mensajes que pediste.",
          "Para mantener VaiBook seguro, evitar abusos y corregir problemas.",
          "Para responder los mensajes que nos envías.",
          "No vendemos tu información personal ni la usamos para publicidad de terceros.",
        ]],
        ["Quién ve tu información", [
          "El negocio con el que reservas ve tu nombre, contacto, datos de la reserva, notas y recibos, para poder atenderte.",
          "Las reseñas son públicas y muestran tu nombre y foto de perfil.",
          "Nuestros proveedores, que guardan y entregan datos por nosotros: Supabase (base de datos e inicio de sesión), Vercel (alojamiento), Google (si eliges entrar con Google) y los servicios de notificaciones de tu teléfono o navegador.",
          "Autoridades, si la ley nos lo exige.",
        ]],
        ["Cuánto tiempo la guardamos", [
          "Guardamos tu cuenta mientras esté abierta. Los registros de reservas se guardan para que los negocios cumplan sus obligaciones de registros e impuestos, que en Belice pueden ser hasta seis años.",
          "Cuando pides eliminar tu cuenta, borramos o anonimizamos tu información personal, salvo lo que la ley nos obliga a guardar.",
        ]],
        ["Tus opciones", [
          "Puedes actualizar tus datos en Ajustes cuando quieras.",
          "Puedes apagar las notificaciones en Ajustes o en tu teléfono.",
          "Puedes pedir una copia de tu información, corregirla o eliminar tu cuenta — en Ajustes → Zona de peligro o contactándonos.",
        ]],
        ["Seguridad", [
          "Tus datos están protegidos con reglas de acceso para que cada persona y negocio vea solo lo necesario. Ningún sistema es perfecto, así que mantén tu contraseña privada y avísanos si crees que alguien usó tu cuenta.",
        ]],
        ["Menores", [
          "VaiBook es para mayores de 18 años. Un padre, madre o tutor puede reservar en nombre de un menor.",
        ]],
        ["Cambios", [
          "Si cambiamos esta política actualizaremos la fecha arriba y te avisaremos en la app si el cambio es importante.",
        ]],
      ],
    },
    terms: {
      intro: "Estos términos aplican cuando usas VaiBook, ya sea para reservar o para manejar tu negocio. Al usar VaiBook los aceptas.",
      sections: [
        ["Qué es VaiBook", [
          "VaiBook es una plataforma de reservas que conecta clientes con negocios locales independientes. Los servicios los prestan esos negocios, no VaiBook, y cada negocio es responsable de sus servicios, precios, políticas y conducta.",
        ]],
        ["Tu cuenta", [
          "Da información correcta y mantén privados tus datos de acceso. Eres responsable de lo que pase en tu cuenta.",
          "Podemos suspender o cerrar cuentas que incumplan estos términos, abusen de la plataforma o pongan en riesgo a otros.",
        ]],
        ["Reservas", [
          "Una solicitud no está confirmada hasta que el negocio la acepta o — si pide depósito — hasta que confirma tu pago.",
          "Llega a tiempo y cancela lo antes posible si no puedes ir. Las ausencias repetidas pueden hacer que los negocios te pidan depósito o rechacen tus solicitudes.",
          "Los negocios pueden rechazar, reprogramar o cancelar reservas, y deben avisarte lo antes posible.",
        ]],
        ["Pagos, depósitos y reembolsos", [
          "Los pagos y depósitos se hacen directamente al negocio con los datos que te da. VaiBook no guarda tu dinero.",
          "Los reembolsos los maneja el negocio según su política. Si no puedes resolver un problema con un negocio, contáctanos y trataremos de ayudar, pero no podemos garantizar el resultado.",
        ]],
        ["Reglas para negocios", [
          "Mantén correctos tus servicios, precios, horario y fotos, y cumple las reservas que aceptas.",
          "Sube solo fotos y contenido que tengas derecho a usar.",
          "Usa la información de los clientes solo para atender sus reservas y mantenla privada.",
          "Eres responsable de tus licencias, impuestos y obligaciones legales. Las herramientas de impuestos de VaiBook son una ayuda, no asesoría fiscal ni legal.",
          "Las tarifas de suscripción, si las hay, se muestran antes de cobrarte.",
        ]],
        ["Reseñas y contenido", [
          "Las reseñas deben ser honestas y de una visita real. Podemos quitar contenido falso, abusivo, discriminatorio o ilegal.",
          "Al publicar contenido en VaiBook nos permites mostrarlo en la plataforma.",
        ]],
        ["Lo que no debes hacer", [
          "No hagas reservas o reseñas falsas, no acoses a nadie, no intentes entrar a cuentas o datos ajenos, no interfieras con el funcionamiento de VaiBook ni lo uses para algo ilegal.",
        ]],
        ["Nuestra responsabilidad", [
          "Trabajamos para que VaiBook funcione bien y sea correcto, pero se ofrece \"tal cual\" y a veces puede no estar disponible o tener errores.",
          "En la medida que la ley lo permita, VaiBook no responde por los servicios de los negocios, por disputas entre clientes y negocios, ni por pérdidas indirectas.",
        ]],
        ["Ley y cambios", [
          "Estos términos se rigen por las leyes de Belice.",
          "Podemos actualizar estos términos. Si hacemos un cambio importante te avisaremos en la app; seguir usando VaiBook significa que aceptas los términos actualizados.",
        ]],
      ],
    },
    updated: "Última actualización",
    questions: "¿Preguntas sobre esta página?",
  },
};

// ---------- pages ----------
function Legal({ L, data, lang, go }) {
  return (
    <>
      <p className="ip-updated">{L.updated}: {UPDATED[lang]}</p>
      <p className="ip-lead">{data.intro}</p>
      {data.sections.map(([h, items]) => (
        <Section key={h} title={h}>
          {items.length === 1 ? <p>{items[0]}</p> : <ul className="ip-list">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>}
        </Section>
      ))}
      <div className="ip-callout">{L.questions} <button className="ip-link" onClick={() => go("contact")}>{TITLES[lang].contact} ›</button></div>
    </>
  );
}

function Districts({ L, go }) {
  const [dir, setDir] = useState(null);
  useEffect(() => {
    let alive = true;
    getProviderDirectory().then((d) => { if (alive) setDir(d || []); }).catch(() => alive && setDir([]));
    return () => { alive = false; };
  }, []);
  const byDistrict = useMemo(() => {
    const m = Object.fromEntries(DISTRICT_LIST.map((d) => [d, []]));
    (dir || []).forEach((p) => { if (m[p.district]) m[p.district].push(p); });
    return m;
  }, [dir]);
  return (
    <>
      <p className="ip-lead">{L.lead}</p>
      {dir === null ? <p className="ip-muted">{L.loading}</p> : (
        <div className="ip-districts">
          {DISTRICT_LIST.map((d) => {
            const list = byDistrict[d];
            return (
              <div key={d} className="ip-district">
                <div className="ip-district-head"><h3>{d}</h3><span className="ip-pill">{L.businesses(list.length)}</span></div>
                {list.length === 0 ? (
                  <p className="ip-muted">{L.none} <button className="ip-link" onClick={() => go("contact")}>{L.tellUs} ›</button></p>
                ) : (
                  <ul className="ip-biz">
                    {list.map((p) => (
                      <li key={p.id}>
                        <div><strong>{p.business_name}</strong><span>{p.service_type || p.services.slice(0, 2).map((s) => s.name).join(" · ")}</span></div>
                        <a className="ip-book" href={`#book-${p.id}`}>{L.book}</a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function Blog({ L }) {
  const [openIdx, setOpenIdx] = useState(null);
  return (
    <>
      <p className="ip-lead">{L.lead}</p>
      <div className="ip-posts">
        {L.posts.map((p, i) => (
          <article key={i} className={`ip-post ${openIdx === i ? "open" : ""}`}>
            <span className={`ip-tag ${p.tag}`}>{p.tag === "c" ? L.tagC : L.tagB}</span>
            <h3>{p.title}</h3>
            {openIdx === i ? (
              <>
                <ol className="ip-post-body">{p.body.map((x, k) => <li key={k}>{x}</li>)}</ol>
                <button className="ip-link" onClick={() => setOpenIdx(null)}>{L.close}</button>
              </>
            ) : (
              <>
                <p className="ip-muted">{p.body[0]}</p>
                <button className="ip-link" onClick={() => setOpenIdx(i)}>{L.read} ›</button>
              </>
            )}
          </article>
        ))}
      </div>
    </>
  );
}

function Help({ L, go, lang }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(null);
  const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const match = ([a, b]) => !q.trim() || norm(a + " " + b).includes(norm(q.trim()));
  const c = L.c.filter(match), b = L.b.filter(match);
  return (
    <>
      <input className="ip-search" type="search" placeholder={L.search} value={q} onChange={(e) => setQ(e.target.value)} />
      {c.length > 0 && <Section title={L.cTitle}><Faq items={c} open={open} setOpen={setOpen} prefix="c" /></Section>}
      {b.length > 0 && <Section title={L.bTitle}><Faq items={b} open={open} setOpen={setOpen} prefix="b" /></Section>}
      {c.length + b.length === 0 && <p className="ip-muted">{L.noResults}</p>}
      <div className="ip-callout">{L.still} <button className="ip-link" onClick={() => go("contact")}>{TITLES[lang].contact} ›</button></div>
    </>
  );
}

function Contact({ L, user }) {
  const [form, setForm] = useState({ name: user?.full_name || "", contact: user?.email || "", topic: "general", message: "" });
  const [state, setState] = useState("idle"); // idle | sending | sent | error | rate | missing
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const send = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.contact.trim() || form.message.trim().length < 5) { setState("missing"); return; }
    setState("sending");
    const r = await submitSupportMessage(form);
    setState(r.ok ? "sent" : r.rateLimited ? "rate" : "error");
  };
  if (state === "sent") {
    return (
      <div className="ip-sent">
        <div className="ip-sent-icon">✓</div>
        <p>{L.sent}</p>
        <button className="ip-btn ghost" onClick={() => { setForm((f) => ({ ...f, message: "" })); setState("idle"); }}>{L.another}</button>
      </div>
    );
  }
  return (
    <>
      <p className="ip-lead">{L.lead}</p>
      <form className="ip-form" onSubmit={send}>
        <label>{L.name}<input value={form.name} onChange={set("name")} maxLength={120} autoComplete="name" /></label>
        <label>{L.contactField}<input value={form.contact} onChange={set("contact")} maxLength={160} autoComplete="email" /></label>
        <label>{L.topic}
          <select value={form.topic} onChange={set("topic")}>{L.topics.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </label>
        <label>{L.message}<textarea rows={6} value={form.message} onChange={set("message")} maxLength={4000} /></label>
        {state === "missing" && <p className="ip-err">{L.missing}</p>}
        {state === "error" && <p className="ip-err">{L.error}</p>}
        {state === "rate" && <p className="ip-err">{L.rate}</p>}
        <button className="ip-btn" type="submit" disabled={state === "sending"}>{state === "sending" ? L.sending : L.send}</button>
      </form>
    </>
  );
}

export default function InfoPages({ page, onClose, onGo, onFind, onListBusiness, user }) {
  const { i18n } = useTranslation();
  const lang = (i18n.language || "en").toLowerCase().startsWith("es") ? "es" : "en";
  const L = C[lang];
  const T = TITLES[lang];
  useEffect(() => {
    const el = document.querySelector(".ip-scroll");
    if (el) el.scrollTop = 0;
  }, [page]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  let body = null;
  if (page === "about") {
    body = (
      <>
        <p className="ip-lead">{L.about.lead}</p>
        {L.about.blocks.map(([h, p]) => <Section key={h} title={h}><p>{p}</p></Section>)}
        <div className="ip-ctas"><button className="ip-btn" onClick={onFind}>{L.about.ctaFind}</button><button className="ip-btn ghost" onClick={onListBusiness}>{L.about.ctaList}</button></div>
      </>
    );
  } else if (page === "how-it-works") {
    body = (
      <>
        <Section title={L.how.cTitle}><Steps items={L.how.c} /></Section>
        <div className="ip-ctas"><button className="ip-btn" onClick={onFind}>{L.how.ctaFind}</button></div>
        <Section title={L.how.bTitle}><Steps items={L.how.b} /></Section>
        <div className="ip-ctas"><button className="ip-btn ghost" onClick={onListBusiness}>{L.how.ctaList}</button></div>
      </>
    );
  } else if (page === "districts") body = <Districts L={L.districts} go={onGo} />;
  else if (page === "blog") body = <Blog L={L.blog} />;
  else if (page === "help") body = <Help L={L.help} go={onGo} lang={lang} />;
  else if (page === "contact") body = <Contact L={L.contact} user={user} />;
  else if (page === "privacy") body = <Legal L={L} data={L.privacy} lang={lang} go={onGo} />;
  else if (page === "terms") body = <Legal L={L} data={L.terms} lang={lang} go={onGo} />;

  return (
    <div className="ip-overlay" role="dialog" aria-modal="true" aria-label={T[page]}>
      <div className="ip-scroll">
        <header className="ip-top">
          <button className="ip-back" onClick={onClose} aria-label={L.back}>← {L.back}</button>
          <span className="ip-brand">vai<span>book</span></span>
        </header>
        <main className="ip-main">
          <h1>{T[page]}</h1>
          {body}
          <nav className="ip-more" aria-label={L.more}>
            <h4>{L.more}</h4>
            <div>
              {INFO_PAGES.filter((p) => p !== page).map((p) => <button key={p} onClick={() => onGo(p)}>{T[p]}</button>)}
            </div>
          </nav>
        </main>
      </div>
    </div>
  );
}
