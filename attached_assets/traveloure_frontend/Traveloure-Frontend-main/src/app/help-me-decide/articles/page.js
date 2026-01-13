"use client"

import { Calendar } from "../../../components/help-me-decide/calendar"
import { Navbar } from "../../../components/help-me-decide/navbar"
import { CalendarDays, ChevronDown, ChevronLeft, ChevronUp, Heart, MessageCircle } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { Carousel, CarouselContent, CarouselItem } from "../../../components/ui/carousel"
import Image from "next/image"
import { ScrollArea } from "../../../components/ui/scroll-area"
import { PiShareFatLight } from "react-icons/pi"
import { Avatar, AvatarFallback, AvatarImage } from "../../../components/ui/avatar"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { useHelpMeDecideCleanup } from "../../../hooks/useHelpMeDecideCleanup"

export default function HelpMeDecideNightlifePage() {
  // Use the cleanup hook to handle localStorage cleanup when navigating away
  useHelpMeDecideCleanup();

  const items = [
    { image: "/articlesimg.png", likes: 560, comments: 102 },
    { image: "/articlesimg.png", likes: 560, comments: 102 },
    { image: "/articlesimg.png", likes: 560, comments: 102 },
    { image: "/sample-destination.png", likes: 560, comments: 102 },
  ]

  // Enhanced comments data with avatars and full text
  const comments = [
    {
      id: "1",
      name: "Mathew Wade",
      avatar: "/placeholder.svg?height=40&width=40",
      time: "3 Hours Ago",
      comment:
        "Loved the cultural suggestions — MoMA and Harlem are on my list now. Also, a great reminder that NYC is more than just Times Square.",
      isCurrentUser: true,
    },
    {
      id: "2",
      name: "Emma Robinson",
      avatar: "/placeholder.svg?height=40&width=40",
      time: "20 Hours Ago",
      comment:
        "This article gave me so many new ideas! I never thought of exploring the beaches in NYC. Definitely adding Coney Island to my itinerary.",
      isCurrentUser: false,
    },
    {
      id: "3",
      name: "James Mitchell",
      avatar: "/placeholder.svg?height=40&width=40",
      time: "20 Hours Ago",
      comment:
        "The food section was spot on — I've tried a few of the places mentioned and they were amazing. Would love more local favorites!",
      isCurrentUser: false,
    },
    {
      id: "4",
      name: "Sarah Johnson",
      avatar: "/placeholder.svg?height=40&width=40",
      time: "1 Day Ago",
      comment:
        "Great guide! I'm planning my first trip to NYC next month and this is exactly what I needed. Any recommendations for family-friendly activities?",
      isCurrentUser: false,
    },
    {
      id: "5",
      name: "David Chen",
      avatar: "/placeholder.svg?height=40&width=40",
      time: "2 Days Ago",
      comment:
        "The nightlife section is perfect. I went to some of those rooftop bars last summer and the views were incredible. Don't miss the speakeasies!",
      isCurrentUser: false,
    },
  ]

  const [api, setApi] = useState(null)
  const [current, setCurrent] = useState(0)
  const [commentText, setCommentText] = useState("")
  const [displayedComments, setDisplayedComments] = useState(comments.slice(0, 3))
  const [showingAll, setShowingAll] = useState(false)
  const [showCalendarMobile, setShowCalendarMobile] = useState(false)

  useEffect(() => {
    if (!api) return
    const onSelect = () => setCurrent(api.selectedScrollSnap())
    api.on("select", onSelect)
    onSelect()
    return () => api.off("select", onSelect)
  }, [api])

  const scrollToSlide = (index) => api?.scrollTo(index)

  const handleAddComment = () => {
    if (!commentText.trim()) return

    const newComment = {
      id: `new-${Date.now()}`,
      name: "You",
      avatar: "/placeholder.svg?height=40&width=40",
      time: "Just now",
      comment: commentText,
      isCurrentUser: true,
    }

    setDisplayedComments([newComment, ...displayedComments])
    setCommentText("")
  }

  const handleShowMore = () => {
    setDisplayedComments(comments)
    setShowingAll(true)
  }

  const handleEditComment = (id) => {
    // Implement edit functionality
    console.log("Editing comment:", id)
  }

  const handleRemoveComment = (id) => {
    setDisplayedComments(displayedComments.filter((comment) => comment.id !== id))
  }

  return (
    <>
      <Navbar />
      <div className="px-4 py-6 flex flex-col lg:flex-row gap-8">
        {/* Left: Article and Comments */}
        <div className="w-full lg:w-1/2">
          <Link href="/help-me-decide" className="flex items-center text-sm text-[#FF385C] mb-4">
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back to Main Page
          </Link>

          {/* Carousel */}
          <ScrollArea className="h-[calc(100vh-5rem)] pr-4">
            <div className="relative mb-4  ">
              <Carousel setApi={setApi}>
                <CarouselContent>
                  {items.map((item, index) => (
                    <CarouselItem key={index}>
                      <div className="relative">
                        <Image
                          src={item.image || "/placeholder.svg"}
                          alt="Article image"
                          width={800}
                          height={500}
                          className="w-full h-[359px] object-cover rounded-xl"
                        />
                      </div>
                    </CarouselItem>
                  ))}
                </CarouselContent>

                {/* Dots */}
                <div className="flex absolute bottom-[22px] right-[50%] translate-x-1/2 gap-2">
                  {items.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => scrollToSlide(index)}
                      className={`h-2 w-2 rounded-full transition-colors ${
                        current === index ? "bg-white" : "bg-gray-400"
                      }`}
                    />
                  ))}
                </div>
              </Carousel>

              {/* Likes & Share */}
              <div className="flex items-center justify-between mt-4 px-2">
                <div className="flex items-center gap-6 text-gray-600 text-sm">
                  <div className="flex items-center gap-1">
                    <Heart className="w-4 h-4 text-[#FF385C]" />
                    {items[0].likes} Likes
                  </div>
                  <div className="flex items-center gap-1">
                    <MessageCircle className="w-4 h-4" />
                    {items[0].comments} Comments
                  </div>
                </div>
                <div className="text-[#FF385C] text-sm flex items-center gap-1 cursor-pointer">
                  <PiShareFatLight className="h-4 w-4" />
                  Share
                </div>
              </div>
            </div>

            {/* Article Body */}
            <div className="text-gray-800 space-y-6">
              <h2 className="text-2xl font-semibold m-0 tracking-tight">
                Your Perfect Trip to New York: A Smart Travel Guide
              </h2>
              <p className="text-sm text-gray-600 leading-relaxed">
                Planning your dream trip to New York City? You're in the right place. Whether it's your first time
                visiting or you're coming back for more, NYC has something for everyone — and this guide will help you
                discover what to do based on your interests.
              </p>

              <h3 className="text-base font-semibold m-0  text-gray-900">Love the Beach?</h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                While NYC isn't the first place that comes to mind for beach lovers, Coney Island and Rockaway Beach are
                great spots to unwind by the ocean. Pair your beach day with boardwalk snacks and amusement rides for a
                chill break from the city buzz.
              </p>

              <h3 className="text-base font-semibold m-0  text-gray-900">Craving Adventure?</h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                Explore the city on foot or by bike — from Central Park's winding paths to kayaking in the Hudson River.
                Want something more thrilling? Try a helicopter tour over Manhattan for unforgettable skyline views.
              </p>

              <h3 className="text-base font-semibold  m-0 text-gray-900">A Food Lover's Paradise</h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                From street carts to Michelin-starred restaurants, NYC is a foodie's heaven. Try iconic eats like New
                York-style pizza, bagels, and food from every culture imaginable. Don't miss out on Chelsea Market or a
                food tour in Queens — the most diverse borough for global cuisine.
              </p>

              <h3 className="text-base font-semibold  m-0 text-gray-900">Nightlife That Never Sleeps</h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                The city truly comes alive after dark. Discover rooftop bars with skyline views, hidden speakeasies in
                the Lower East Side, or go dancing in Brooklyn. Broadway shows, jazz clubs, or comedy nights — the
                nightlife scene is as vast as the city itself.
              </p>
            </div>

            {/* Comments Section */}
            <div className="mt-12 mb-8">
              <h3 className="text-xl font-semibold mb-4">Comments ({comments.length})</h3>

              {/* Comment Input */}
              <div className="flex items-center gap-3 mb-6">
                <Avatar className="w-10 h-10">
                  <AvatarImage src="/placeholder.svg?height=40&width=40" alt="Your avatar" />
                  <AvatarFallback>YA</AvatarFallback>
                </Avatar>
                <div className="flex-1 flex gap-2">
                  <Input
                    type="text"
                    placeholder="Add your comment or Feedback"
                    className="flex-1"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddComment()
                    }}
                  />
                  <Button
                    className="bg-[#FF385C] hover:bg-[#ff4a74]"
                    onClick={handleAddComment}
                    disabled={!commentText.trim()}
                  >
                    Send
                  </Button>
                </div>
              </div>

              {/* Comments List */}
              {displayedComments.map(({ id, name, avatar, time, comment, isCurrentUser }) => (
                <div
                  key={id}
                  className={`flex items-start gap-3 mb-6 p-3 rounded-xl`}
                >
                  <Avatar>
                    <AvatarImage src={avatar} alt={name} />
                    <AvatarFallback>{name.split(" ").map(n => n[0]).join("")}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="flex justify-between items-center">
                      <p className="font-semibold text-[#FF385C]">{name}</p>
                      <span className="text-xs text-gray-400">{time}</span>
                    </div>
                    <p className="text-sm text-gray-800">{comment}</p>
                    {isCurrentUser && (
                      <div className="mt-2 flex gap-4">
                        <button
                          className="text-sm text-[#FF385C] hover:underline"
                          onClick={() => handleEditComment(id)}
                        >
                          Edit
                        </button>
                        <button
                          className="text-sm text-red-600 hover:underline"
                          onClick={() => handleRemoveComment(id)}
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {!showingAll && (
                <Button variant="link" className="text-[#FF385C]" onClick={handleShowMore}>
                  Show More
                </Button>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Right: Calendar and Sidebar */}
        <div className="w-full lg:w-1/2">
          <div className="hidden lg:block">
            <Calendar />
          </div>

          <div className="block lg:hidden">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCalendarMobile(!showCalendarMobile)}
              className="flex items-center gap-2 w-full justify-center mt-4"
            >
              <CalendarDays className="h-4 w-4" />
              {showCalendarMobile ? "Hide Calendar" : "Show Calendar"}
              {showCalendarMobile ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>

            {showCalendarMobile && (
              <div className="mt-4">
                <Calendar />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
