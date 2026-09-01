# Landing Moment demo photo sources

These real photographs back the explicitly requested Landing Moments demo fixtures.
The application stores the original Wikimedia Commons media URLs and does not treat
the images as AI-generated.

| Moment city | Photograph | Creator | License | Source |
| --- | --- | --- | --- | --- |
| Kyoto | Kusho Myōjin shrine, Ninna-ji temple, Kyoto | Carles Tomás Martí | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Kusho_My%C5%8Djin_shrine,_Ninna-ji_temple,_Kyoto_-_Oct_25,_2009.jpg) |
| Edinburgh | Balcomie Links Golf Course at Fife Ness | Mat Fascione | [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Balcomie_Links_Golf_Course_at_Fife_Ness_-_geograph.org.uk_-_7375989.jpg) |
| Cartagena | Night Scenes, Cartagena, Colombia | Joe Ross | [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Night_Scenes,_Cartagena,_Colombia_(24431322999).jpg) |

The fixed fixture IDs start with `landing-moment-demo-`. Each row is attributed to
an unmistakable development-only curator (`@dev-fixture-kyoto`,
`@dev-fixture-edinburgh`, or `@dev-fixture-cartagena`) on a
`@traveloure.test` identity whose expert-form city matches the Moment market.
Production seeding is disabled, and the production boot purge removes these
reserved gem IDs and test identities after captures.