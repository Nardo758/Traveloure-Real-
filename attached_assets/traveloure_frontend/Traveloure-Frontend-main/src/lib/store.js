import { configureStore } from "@reduxjs/toolkit";
import loginSlice from "../app/redux-features/auth/auth";
import ItinerarySlice from "../app/redux-features/Itinerary/ItinerarySlice";
import HelpmeDecide from "../app/redux-features/help-me-decide/HelpmeDecideSlice";
import TalktoExpert from "../app/redux-features/TalktoExpert/TalktoExpert";
import Userprofile from "../app/redux-features/userprofile/UserprofileSlice";
import TravelExperts from "../app/redux-features/Travelexperts/travelexpertsSlice";
import ServiceProvider from "../app/redux-features/service-provider/serviceProviderSlice";
import ChatSlice from "../app/redux-features/chat/chatSlice";
import LocalExpertSlice from "../app/redux-features/local-expert/localExpertSlice";
import CategorySlice from "../app/redux-features/category/categorySlice";
import FAQSlice from "../app/redux-features/faq/faqSlice";

export const store = configureStore({
  reducer: {
    auth: loginSlice,
    itinerary :ItinerarySlice,
    helpme : HelpmeDecide,
    talkexpert : TalktoExpert,
    userprofile : Userprofile,
    travelExperts : TravelExperts,
    serviceProvider : ServiceProvider,
    chat: ChatSlice,
    localExpert: LocalExpertSlice,
    category: CategorySlice,
    faq: FAQSlice
  },
});
