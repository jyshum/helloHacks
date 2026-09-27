"use client";

import { useRef } from "react";

export default function Disclaimer() {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="text-xs text-muted underline underline-offset-4 hover:text-ubc focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/40"
      >
        Disclaimer
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby="disclaimer-title"
        onClick={(event) => {
          if (event.target === dialogRef.current) dialogRef.current.close();
        }}
        className="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-xl rounded-3xl border border-white/70 bg-[#f5f8fc] p-0 text-ink shadow-2xl backdrop:bg-ink/40"
      >
        <div className="flex items-start justify-between gap-4 border-b border-ink/10 p-5 sm:p-6">
          <div>
            <h2 id="disclaimer-title" className="text-xl font-bold text-ubc">Hopped Terms of Use, Safety &amp; Consent</h2>
            <p className="mt-1 text-xs text-muted">Last updated: [DATE]</p>
          </div>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="shrink-0 rounded-full px-3 py-1 text-sm font-semibold text-muted hover:bg-ink/5 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/40"
            aria-label="Close disclaimer"
          >
            Close
          </button>
        </div>
        <article className="max-h-[calc(85dvh-5.5rem)] overflow-y-auto px-5 py-4 text-sm leading-6 text-ink/85 sm:px-6">
          <p className="mb-4">I&apos;m a current UBC student or staff member, at least 18 years old, and I agree to the Hopped Terms of Use and Privacy Policy. I understand Hopped connects commuters but does not provide transportation, and I ride and drive at my own risk.</p>
          <p className="mb-4">By creating an account or using Hopped, you agree to the following. If you do not agree, do not use the app.</p>

          <h3 className="mt-5 font-bold text-ubc">1. What Hopped is</h3>
          <p>Hopped is a platform that helps UBC commuters find each other and share rides to and from campus in recurring groups called pods. Hopped does not provide transportation, does not employ drivers, and is not a taxi, ride-hail, or transit service. Drivers and riders are independent users who choose to travel together.</p>
          <p className="mt-2">Hopped is an independent student project. It is not affiliated with, endorsed by, or operated by the University of British Columbia.</p>

          <h3 className="mt-5 font-bold text-ubc">2. Who can use Hopped</h3>
          <p>You must be at least 18 years old and have a valid UBC email address. You agree to give accurate information about yourself, including your name, faculty, year, photo, and commute details. One account per person. You are responsible for all activity on your account.</p>

          <h3 className="mt-5 font-bold text-ubc">3. Drivers</h3>
          <p>If you drive with Hopped, you confirm that:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>You hold a valid, unrestricted driver&apos;s licence for British Columbia.</li>
            <li>The vehicle you use is legally registered, roadworthy, and insured with valid insurance that covers you and your passengers.</li>
            <li>You will follow all traffic laws and never drive while impaired, distracted, or fatigued.</li>
            <li>You will only carry as many passengers as your vehicle has seatbelts.</li>
            <li>The licence and vehicle details you submit are true and belong to you.</li>
          </ul>
          <p className="mt-2">Licence verification is a manual check by the Hopped team. It confirms that documents were submitted and appear valid. It is not a background check, a driving-record guarantee, or an endorsement of any driver.</p>
          <p className="mt-2">You are responsible for confirming that carrying passengers for payment is allowed under your insurance policy and under applicable laws, including the BC Passenger Transportation Act.</p>

          <h3 className="mt-5 font-bold text-ubc">4. Riders</h3>
          <p>If you ride with Hopped, you agree to:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Be at your pickup spot on time, or skip the day in the app ahead of time.</li>
            <li>Wear a seatbelt at all times.</li>
            <li>Treat drivers and other riders with respect.</li>
            <li>Pay the ride price shown in the app for rides you take.</li>
          </ul>

          <h3 className="mt-5 font-bold text-ubc">5. Safety</h3>
          <p>You are responsible for your own safety decisions. Before any ride, check that the driver, car, and licence plate match what the app shows. Never get into a vehicle you feel unsafe in. You can cancel, leave a pod, or report a user at any time.</p>
          <p className="mt-2">In an emergency, call 911. Hopped is not an emergency service and cannot dispatch help.</p>

          <h3 className="mt-5 font-bold text-ubc">6. Location sharing</h3>
          <p>During a live trip, Hopped shares your real-time location with the other people on that trip, so riders can see the car coming and drivers can see pickup spots. Location sharing starts when a trip starts and stops when it ends. Other users only ever see your neighbourhood, never your full home address, except where a pickup or drop-off spot is needed for a ride you have joined.</p>
          <p className="mt-2">By starting or joining a trip, you consent to this location sharing.</p>

          <h3 className="mt-5 font-bold text-ubc">7. Payments</h3>
          <p>Ride prices are shown before you join a pod and include a driver fee, a company fee, a gas cost based on distance, and applicable tax. Rides are charged automatically from your Hopped wallet when a trip ends. If your wallet balance is too low, it is topped up from your saved payment method before the charge.</p>
          <p className="mt-2">During this demo phase, all wallet balances, top-ups, charges, and cash-outs use demo money only. No real money is charged, transferred, or paid out.</p>

          <h3 className="mt-5 font-bold text-ubc">8. Messages and conduct</h3>
          <p>Pod chat is for coordinating rides. You agree not to post harassment, hate speech, threats, sexual content, spam, or anyone&apos;s private information. Hopped may remove content, pause, or close accounts that break these rules. Users can report messages, and reported content may be reviewed by the Hopped team.</p>

          <h3 className="mt-5 font-bold text-ubc">9. Your information</h3>
          <p>We collect the information you give us (name, UBC email, faculty, year, photo, home area, schedule, vehicle and licence details) and trip data (pickups, drop-offs, live location during trips, ratings, and payments). We use it only to run Hopped: matching you with a pod, running trips, keeping users safe, and processing payments. Licence photos are private and only visible to the Hopped review team. We do not sell your information. You can ask us to delete your account and data at any time by contacting <a className="underline underline-offset-2" href="mailto:hoppedin@gmail.com">hoppedin@gmail.com</a>.</p>

          <h3 className="mt-5 font-bold text-ubc">10. No guarantees</h3>
          <p>Hopped is provided &quot;as is.&quot; We do not guarantee that you will be matched, that a driver will show up, that rides will be on time, or that the app will always be available or error-free. Plan a backup way to get to campus, especially for exams and important commitments.</p>

          <h3 className="mt-5 font-bold text-ubc">11. Limitation of liability</h3>
          <p>To the fullest extent allowed by law, Hopped and its creators are not liable for any injury, loss, damage, delay, or dispute arising from rides arranged through the app, from the conduct of any user, or from your use of the app. Any dispute about a ride is between the people involved in that ride. Nothing in these terms limits any rights you have that cannot be limited by law.</p>

          <h3 className="mt-5 font-bold text-ubc">12. Ending your use</h3>
          <p>You can stop using Hopped at any time. We may suspend or close accounts that break these terms or put other users at risk.</p>

          <h3 className="mt-5 font-bold text-ubc">13. Changes</h3>
          <p>We may update these terms. If we make significant changes, we will let you know in the app. Continuing to use Hopped means you accept the updated terms.</p>

          <h3 className="mt-5 font-bold text-ubc">14. Contact</h3>
          <p className="mb-3">Questions, reports, or data requests: <a className="underline underline-offset-2" href="mailto:hoppedin@gmail.com">hoppedin@gmail.com</a></p>
        </article>
      </dialog>
    </>
  );
}
