import type { CoreMessage, MessageCopy, MessageValues } from "./_core-definition";

// Supported translations have explicit copy; unsupported saved languages fall
// back to English rather than pretending English text is another language.
export function localizedCopy(message: CoreMessage, values: MessageValues): { copy: MessageCopy; language: string } {
  const language = (values.language || "en").split("-")[0].toLowerCase();
  const name = values.name;
  const copies: Record<string, Partial<Record<string, MessageCopy>>> = {
    es: {
      welcome: { subject: `Bienvenido a Traveloure, ${name}`, body: "Ya estás dentro. Dile a nuestra IA adónde quieres ir y obtén un itinerario completo en minutos. ¿Necesitas ayuda? Responde a este correo.", button: "Planificar mi primera experiencia" },
      profile_nudge: { subject: "Termina de configurar tu perfil", body: `Un perfil completo ayuda a nuestra IA a crear mejores viajes para ti, ${name}. Solo necesitas 2 minutos para terminar.`, button: "Completar mi perfil" },
      planner_nudge: { subject: `¿Adónde quieres ir, ${name}?`, body: "Todavía no has planificado un viaje: cuéntale a nuestra IA tu destino soñado y obtén un itinerario completo en minutos.", button: "Empezar a planificar" },
    },
    fr: {
      welcome: { subject: `Bienvenue sur Traveloure, ${name}`, body: "Vous voilà prêt. Dites à notre IA où vous voulez aller et obtenez un itinéraire complet en quelques minutes. Besoin d'aide ? Répondez simplement à cet e-mail.", button: "Planifier ma première expérience" },
      profile_nudge: { subject: "Terminez la configuration de votre profil", body: `Un profil complet aide notre IA à créer de meilleurs voyages pour vous, ${name}. Il suffit de 2 minutes pour terminer.`, button: "Compléter mon profil" },
      planner_nudge: { subject: `Où voulez-vous aller, ${name} ?`, body: "Vous n'avez pas encore planifié de voyage : indiquez à notre IA votre destination de rêve et obtenez un itinéraire complet en quelques minutes.", button: "Commencer à planifier" },
    },
    hi: {
      welcome: { subject: `Traveloure में आपका स्वागत है, ${name}`, body: "आप तैयार हैं। हमारी AI को बताएं कि आप कहाँ जाना चाहते हैं और कुछ ही मिनटों में पूरा यात्रा कार्यक्रम पाएं। मदद चाहिए? बस इस ईमेल का जवाब दें।", button: "मेरे पहले अनुभव की योजना बनाएं" },
      profile_nudge: { subject: "अपनी प्रोफ़ाइल पूरी करें", body: `पूरी प्रोफ़ाइल हमारी AI को आपके लिए बेहतर यात्राएं बनाने में मदद करती है, ${name}। इसे पूरा करने में सिर्फ़ 2 मिनट लगेंगे।`, button: "अपनी प्रोफ़ाइल पूरी करें" },
      planner_nudge: { subject: `आप कहाँ जाना चाहते हैं, ${name}?`, body: "आपने अभी तक यात्रा की योजना नहीं बनाई है — हमारी AI को अपने सपनों की मंज़िल बताएं और कुछ ही मिनटों में पूरा यात्रा कार्यक्रम पाएं।", button: "योजना बनाना शुरू करें" },
    },
  };
  const original = message.copy(values);
  const translated = copies[language]?.[message.kind];
  return { copy: translated ? { ...original, ...translated } : original, language: translated ? language : "en" };
}