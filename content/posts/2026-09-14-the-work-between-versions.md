---
title: "The Work Between Versions"
date: "2026-09-14"
slug: "the-work-between-versions"
excerpt: "Creative tools are getting better at preserving an existing composition, scene, sound or software project while it evolves."
cover: ""
---

The most interesting art technology this week concerned continuity. New tools are starting to remember a composition, preserve a musical phrase, stay inside a timeline and carry an artwork from code to room. For a working generative artist, that matters because the serious work begins after the first result.

We already have machines that can produce a striking image in seconds. The harder problem is keeping hold of an idea through fifty revisions. A face changes. A colour balance drifts. A camera move loses the geometry of the space. A musical edit destroys the phrase that gave the piece its character. Creative work lives in this awkward territory between versions, and several releases this week moved directly into it.

## Generation enters the edit

On 8 September, Adobe introduced a Generative Media tool inside Premiere. An editor can mark a gap in a sequence and generate video that uses nearby reference frames as context. Adobe is also putting Firefly beside partner models from Google Veo, Kling, Runway and Luma, so model choice becomes part of the edit. Sound effects, soundscapes and music can be generated in the same timeline. The clips remain editable. [Adobe’s announcement](https://blog.adobe.com/en/publish/2026/09/08/generate-create-directly-in-your-timeline-with-new-ai-powered-innovations-in-premiere-after-effects)

The larger shift sits in After Effects. Its new AI Assistant works across a whole project, including compositions with thousands of layers. It can inspect footage, organise assets, repair technical problems and create expressions from a written instruction. This is close to the way artists actually work. A project is a network of dependencies, accidents and half-solved decisions. Any assistant that sees only the active frame sees very little.

I can imagine using the Premiere tools for the short films that surround a generative collection: extending a shot, building a restrained soundscape, or repairing a transition while the visual language stays intact. The useful benchmark will be aesthetic continuity. Speed is easy to advertise. Holding the mood of a piece through repeated intervention is harder.

OpenAI’s [ChatGPT Images 2.5](https://openai.com/index/introducing-chatgpt-images-2-5/), also released on 8 September, points in the same direction. The model promises stronger subject preservation and more reliable multi-turn editing, with generation latency reduced by up to 50 percent. Sketch input and comments placed directly on an image give the artist more precise ways to indicate composition and local changes. Two API versions divide the job between faster production and slower, more exact work.

I remain cautious about image models as a source of finished art. Their value rises when they behave as controlled production tools. Editorial crops, clean extensions, background repairs, storyboards and campaign variants all depend on preserving decisions already made. A model that knows what to leave alone may be more useful than one with a larger catalogue of styles.

## Music starts to acquire an economic structure

Suno released [v6 on 9 September](https://suno.com/blog/introducing-v6), developed with Warner Music Group, BMG and Believe. The practical changes are substantial. A creator can alter one section in plain language, change a single lyric, combine parts from several songs, isolate a sample, or begin with text, audio, an image and video together. The range includes a precise model, an exploratory v6-wild model and a faster free model.

The partnership matters as much as the features. Suno says it is building opt-in products around individual artists, with payment when artists choose to participate. The details still need scrutiny, especially attribution, consent, accounting and the treatment of independent creators. Even so, this is a concrete attempt to make licensing part of the product architecture.

For visual artists, sound has often been licensed late or treated as a production cost. Generative exhibitions need a deeper relationship between image, sound and time. A model that can preserve a visual work’s rhythm while a musical passage is revised could make small, responsive installations more viable. The business question is whether revenue reaches the people whose work gives the system value.

## Browser art gets quieter engineering gains

Three.js [released r186 on 8 September](https://github.com/mrdoob/three.js/releases). The release contains useful WebGPU and WebXR work: improved antialiasing for XR layers, fixes for XR shadows and transmission, a direct render pipeline, asynchronous compute compilation and more robust disposal of 3D objects. These are engineering changes, yet they touch the visible quality of browser-based art and the amount of work a device can sustain.

WebGPU gives browsers more direct access to modern graphics hardware. That opens room for larger particle systems, GPU simulation and spatial work that can run through a link. The new disposal method is equally welcome. Long-lived generative pieces often accumulate textures, geometry and scene objects. Memory management becomes part of the artwork when a piece is expected to run all day on a wall or inside a headset.

There are migration risks. The mesh simplifier is now asynchronous, some names have changed, and shadow behaviour has moved. I would test r186 on a branch and measure frame time, memory and visual differences on weak hardware. A library release earns its place in an artwork only after the work survives it.

## The exhibitions are asking better questions

Ars Electronica ran from 9 to 13 September across roughly forty locations in Linz. Its [2026 programme](https://ars.electronica.art/negotiatinghumanity/en/) spread media art through a school, churches, a hospital, museums and public space. Deep Space 8K treated archives as living environments. The new *Hello Worlds!* exhibition placed AI in robots, vehicles and physical objects. A conference day called *Negotiating with Water* connected technology with ecology, politics and shared resources.

This curatorial frame feels timely. Spatial media gains force when the work has a reason to occupy space. Water, memory, labour and public life offer systems with friction and consequence. They also give an artist material that can resist the smoothness of a demonstration.

SuperRare’s [*./spiral* moved online on 11 September](https://superrarelabs.substack.com/p/rsvp-spiral-opens-in-new-york-this), after its physical run at Fondazione Aversano in New York. Eleven artists returned to early models, abandoned systems and unresolved ideas, extending them through interactive work, ceramics and print. The exhibition calls itself a futurespective. That word captures something important about computational art: the source code remains available for another encounter, and an old system can become new material.

The week leaves me with a simple thought. Generative art has always been built through recurrence. A rule runs again. A seed changes. A viewer returns. The tools around the work are beginning to understand that rhythm. The most valuable ones will preserve intention across versions, support the life of the work in public and make the economics legible to the people who created it.
