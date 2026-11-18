export const hashtagSuggestions=[{title:"Mode",tags:["mode","lookdujour","tenuedujour","stylefemme","outfit"]},{title:"Lifestyle",tags:["lifestyle","viedetouslesjours","quotidien","bienetre","inspiration"]},{title:"Voyage",tags:["voyage","travel","vacances","escapade","decouverte"]},{title:"Beauté",tags:["beaute","maquillage","skincare","routinebeaute","parfum"]},{title:"Maison & déco",tags:["decoration","decointerieur","maison","homedecor","interieur"]},{title:"Sport & loisirs",tags:["fitness","sport","running","yoga","passion"]},{title:"Business & entrepreneuriat",tags:["business","entrepreneur","entrepreneuriat","entrepreneuse","freelance","motivationbusiness"]}];

export function relatedHashtags(hashtag) {
  return hashtagSuggestions.find(group => group.tags.includes(hashtag))?.tags ?? [hashtag];
}

export function matchingHashtags(caption, theme) {
  const tags = new Set(Array.from(caption.matchAll(/#([\p{L}\p{M}\p{N}_]+)/gu), match =>
    match[1].normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
  ));
  return theme.filter(tag => tags.has(tag));
}
