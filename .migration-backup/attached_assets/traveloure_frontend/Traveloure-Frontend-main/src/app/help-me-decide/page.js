"use client"

import  {Navbar}  from "../../components/help-me-decide/navbar"
import  {TripPlanner}  from "../../components/help-me-decide/trip-planner"
import { useHelpMeDecideCleanup } from "../../hooks/useHelpMeDecideCleanup"

export default function Home() {
  // Use the cleanup hook to handle localStorage cleanup when navigating away
  useHelpMeDecideCleanup();

  return (
    <main className=" bg-white">
      <Navbar />
      <TripPlanner />
    </main>
  )
}
