import { Injectable, NotFoundException, BadRequestException, OnModuleInit, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ModuleTemplate, ModuleDocument } from './schemas/module.schema';

const SEED_MODULES: Partial<ModuleTemplate>[] = [
  // ── STANDALONE AGENTS ────────────────────────────────────────────────────

  {
    name: 'Youtube Agent',
    slug: 'youtube-agent',
    description: 'A fully automated YouTube content pipeline. Discovers trending topics in your niche, writes scripts, generates videos with Seedance, creates thumbnails, and uploads on a schedule — all automatically.',
    tagline: 'Automate your entire YouTube channel with AI',
    moduleType: 'agent', category: 'youtube', pipelineType: 'youtube', outputType: 'video',
    icon: '🎬', color: '#ef4444', badge: 'Live', sortOrder: 1,
    isActive: true, isComingSoon: false,
    nicheSlug: 'content_social', pipelineCategory: 'standalone', availableIn: ['UAE', 'Kenya'],
    requiredApiKeys: ['openai', 'seedance', 'atlas', 'youtube'],
    estimatedCostPerRun: '$3-5 Per Video',
    platforms: ['youtube'],
    capabilities: ['Trend discovery', 'AI scriptwriting', 'Seedance video generation', 'TTS voiceover', 'AI thumbnails', 'Auto upload + scheduling', 'Shorts extraction', 'SEO optimisation'],
    pricing: { monthly: 49, annual: 39, features: ['1 video per day', 'AI script writing (1,500+ words)', '12 Seedance video clips', 'Auto YouTube upload', 'AI thumbnail generation', '3 Shorts per video', 'Daily trend discovery', 'SEO optimized metadata', 'Email notifications', 'Priority support'], hasCustomPlan: true, customLabel: 'Need multiple channels or a white-label solution for your agency?' },
    heroStats: [{ label: 'Video generated', value: '20+' }, { label: 'Avg cost per video', value: '$3-5' }, { label: 'Shorts per video', value: '3' }, { label: 'Pipeline success ratio', value: '95%' }],
    features: [
      { icon: '⚡', title: 'Viral hook generation', description: 'Generates psychological hooks proven to stop scrollers. Uses dark psychology principles like curiosity gaps, fear of missing out, and social proof triggers.' },
      { icon: '📝', title: 'AI scriptwriting', description: 'Full 8-12 minute scripts written in an authoritative, mysterious tone. Optimised for watch time and audience retention.' },
      { icon: '🔍', title: 'Trend discovery', description: 'Scans YouTube daily for trending topics in psychology, human behavior and self-improvement. Picks the highest-potential topic automatically.' },
      { icon: '📈', title: 'SEO optimisation', description: 'Titles, descriptions, tags and chapters all written for maximum YouTube search visibility. Targets low-competition, high-CPM keywords.' },
      { icon: '🎬', title: 'Seedance video generation', description: '12 cinematic dark and atmospheric video clips generated per video using Seedance v1.5 Pro. $1.32 per complete video.' },
      { icon: '📤', title: 'Auto upload + scheduling', description: 'Videos uploaded as private with publishAt timestamps. Goes live Tuesday, Thursday, Saturday at your configured time.' },
    ],
    howItWorks: [
      { step: '1', title: 'Agent discovers trending topic', description: 'Every day the agent scans YouTube for viral psychology topics. Scores each one for CPM potential, competition level, and evergreen value — then picks the best.' },
      { step: '2', title: 'Script and metadata generated', description: 'Ollama LLM writes a full 10-minute script, YouTube title, description, tags, chapters, thumbnail prompt and hook. All in your brand voice.' },
      { step: '3', title: 'Video created automatically', description: 'Seedance generates 12 cinematic clips. OpenAI TTS narrates the script. FFmpeg assembles the final video with subtitles. Flux AI generates the thumbnail.' },
      { step: '4', title: 'Uploaded and scheduled', description: 'The finished video uploads to YouTube, sets the thumbnail, adds chapters, and schedules to go public at your preferred time. You get an email when done.' },
    ],
    faq: [
      { question: 'How much does video generation cost?', answer: 'Each video costs approximately $1.32 in Seedance API credits (12 clips × 5 seconds × $0.022/second). This is billed directly to your Atlas account.' },
      { question: 'Do I need a youtube channel already?', answer: 'Yes. You need an existing YouTube channel and Google account with YouTube API access enabled. The agent uploads directly to your channel via OAuth.' },
      { question: 'Can viewers tell the content is AI generated?', answer: 'The scripts, voiceover, and videos are high quality — most viewers cannot tell. YouTube requires AI content disclosure which we set automatically on every upload.' },
      { question: 'How many videos does it generate per week?', answer: 'By default 3 long-form videos per week (Tuesday, Thursday, Saturday) plus 3 shorts from each. You can configure the schedule to daily if you want more.' },
    ],
    demoVideoUrl: 'https://youtu.be/PtQZUyvAFco',
  },

  {
    name: 'Instagram Reels Agent',
    slug: 'instagram-reels-agent',
    description: 'Automatically creates and publishes viral Instagram Reels daily. AI generates scripts, voiceover, vertical video clips, captions and hashtags — posted on autopilot.',
    tagline: 'Go viral on Instagram without lifting a finger',
    moduleType: 'agent', category: 'instagram', pipelineType: 'instagram', outputType: 'video',
    icon: '📸', color: '#e1306c', badge: 'Live', sortOrder: 2,
    isActive: true, isComingSoon: false,
    nicheSlug: 'content_social', pipelineCategory: 'standalone', availableIn: ['UAE', 'Kenya'],
    requiredApiKeys: ['openai', 'atlas', 'instagram'],
    estimatedCostPerRun: '$1-2 Per Reel',
    platforms: ['instagram'],
    capabilities: ['Trending audio detection', 'AI script writing', 'Vertical video generation', 'Auto captions', 'Hashtag optimization', 'Auto publishing', 'Story cross-posting', 'Engagement tracking'],
    pricing: { monthly: 39, annual: 29, features: ['1-3 Reels per day', 'AI script writing', 'Vertical video generation', 'Trending audio detection', 'Auto captions & hashtags', 'Auto publishing at peak times', 'Arabic + English support', 'Analytics tracking', 'Email notifications', 'Priority support'], hasCustomPlan: true, customLabel: 'Need multiple Instagram accounts or agency-level volume?' },
    heroStats: [{ label: 'Reels per day', value: '1-3' }, { label: 'Cost per reel', value: '$1-2' }, { label: 'Platforms', value: 'Instagram' }, { label: 'Languages', value: 'EN + AR' }],
    features: [
      { icon: '📱', title: 'Vertical Video Generation', description: 'AI generates cinematic 9:16 vertical clips optimized for Instagram Reels. Each reel is visually engaging with smooth transitions and on-brand aesthetics.' },
      { icon: '🎵', title: 'Trending Audio Detection', description: 'Agent monitors trending sounds and audio on Instagram daily. Hooks your content to viral audio to maximize reach and discoverability.' },
      { icon: '✍️', title: 'AI Caption Writing', description: 'Generates scroll-stopping captions with personality. Includes emojis, line breaks for readability, and a strong call-to-action on every post.' },
      { icon: '#️⃣', title: 'Hashtag Optimization', description: 'Researches and selects 20-30 high-reach hashtags per reel. Mixes broad, niche, and trending tags for maximum organic reach.' },
      { icon: '🕐', title: 'Auto Publishing', description: 'Schedules and publishes reels at peak engagement times for your audience timezone. Fully hands-off posting every single day.' },
      { icon: '📊', title: 'Performance Tracking', description: 'Monitors views, likes, shares and saves. Learns what performs best in your niche and doubles down on winning formats.' },
    ],
    howItWorks: [
      { step: '1', title: 'Topic & trend research', description: 'Agent scans Instagram and TikTok daily for trending topics, audio and formats in your niche. Selects the highest-potential content idea automatically.' },
      { step: '2', title: 'Script and visuals created', description: 'AI writes a punchy 30-60 second reel script. Generates vertical video clips and selects trending audio to pair with the content.' },
      { step: '3', title: 'Caption and hashtags written', description: 'Crafts an engaging caption with emojis and CTA. Researches and attaches 20-30 optimized hashtags for maximum organic reach.' },
      { step: '4', title: 'Auto-published to Instagram', description: 'Reel uploaded and published automatically at the optimal time for your audience. You get a notification when it goes live.' },
    ],
    faq: [],
    demoVideoUrl: '',
  },

  {
    name: 'Arabic Content Agent',
    slug: 'arabic-content-agent',
    description: 'Creates fully automated Arabic YouTube and social media content. AI writes scripts in native Arabic, generates culturally relevant videos, Arabic TTS voiceover and publishes on schedule.',
    tagline: 'Dominate Arabic content on YouTube and social media',
    moduleType: 'agent', category: 'arabic', pipelineType: 'arabic', outputType: 'video',
    icon: '🌍', color: '#10b981', badge: 'Coming Soon', sortOrder: 3,
    isActive: true, isComingSoon: true,
    nicheSlug: 'content_social', pipelineCategory: 'standalone', availableIn: ['UAE'],
    requiredApiKeys: ['openai', 'atlas', 'youtube'],
    estimatedCostPerRun: '$3-5 Per Video',
    platforms: ['youtube', 'instagram'],
    capabilities: ['Native Arabic scriptwriting', 'Arabic TTS voiceover', 'GCC cultural adaptation', 'Multi-dialect support', 'Arabic SEO optimization', 'YouTube + Instagram publishing', 'RTL thumbnail design', 'Arabic hashtags'],
    pricing: { monthly: 49, annual: 39, features: ['1-3 videos per day', 'Native Arabic scriptwriting', 'Gulf dialect TTS voiceover', 'YouTube + Instagram publishing', 'Arabic SEO optimization', 'RTL thumbnail generation', 'GCC cultural adaptation', 'Email notifications', 'Priority support'], hasCustomPlan: true, customLabel: 'Need Arabic content at scale across multiple platforms or brands?' },
    heroStats: [{ label: 'Languages', value: 'AR/EN' }, { label: 'Dialects', value: 'Gulf+' }, { label: 'Platforms', value: 'YT + IG' }, { label: 'Market', value: 'GCC+' }],
    features: [
      { icon: '🗣️', title: 'Native Arabic Scriptwriting', description: 'AI writes fully native Arabic scripts — not translations. Content feels natural, culturally appropriate and resonates with GCC audiences.' },
      { icon: '🎙️', title: 'Arabic TTS Voiceover', description: 'Natural-sounding Arabic text-to-speech with Gulf dialect support. Sounds professional and authentic to Arab audiences.' },
      { icon: '🌍', title: 'GCC Cultural Adaptation', description: 'Content is adapted for UAE, Saudi Arabia, Kuwait and wider GCC sensibilities. Avoids cultural missteps and maximizes local relevance.' },
      { icon: '📱', title: 'Multi-Platform Publishing', description: 'Publishes to YouTube, Instagram Reels and TikTok simultaneously. One pipeline, multiple platforms, maximum reach.' },
      { icon: '🔍', title: 'Arabic SEO Optimization', description: 'Titles, descriptions and tags optimized for Arabic YouTube search. Targets high-CPM Arabic keywords for maximum revenue potential.' },
      { icon: '🎨', title: 'RTL Thumbnail Design', description: 'Generates Arabic thumbnails with right-to-left text layout. Designed to stand out in Arabic YouTube search results.' },
    ],
    howItWorks: [
      { step: '1', title: 'Arabic Trend Discovery', description: 'Agent scans Arabic YouTube and social media daily for trending topics across UAE, Saudi Arabia and wider GCC. Picks the highest-potential topic automatically.' },
      { step: '2', title: 'Native Arabic Script Written', description: 'AI writes a full Arabic script in Gulf dialect. Culturally adapted, SEO optimized and written for maximum watch time retention.' },
      { step: '3', title: 'Video and Voiceover Generated', description: 'Arabic TTS voiceover recorded. Video clips generated and assembled with Arabic subtitles and RTL thumbnail design.' },
      { step: '4', title: 'Published Across Platforms', description: 'Video uploaded to YouTube with Arabic metadata. Reels version posted to Instagram. You receive a notification when everything is live.' },
    ],
    faq: [
      { question: 'Which Arabic dialects are supported?', answer: 'Gulf dialect (UAE, Saudi, Kuwait, Qatar) is the primary focus. Modern Standard Arabic (MSA) is also supported for more formal content.' },
      { question: 'Do I need separate YouTube channels for Arabic and English?', answer: 'Yes, we recommend a dedicated Arabic channel for better SEO and audience targeting. The agent manages it completely automatically.' },
      { question: 'Can it post on both YouTube and Instagram?', answer: 'Yes. Each pipeline run produces a long-form YouTube video and a vertical Reels version for Instagram automatically.' },
      { question: 'Is the Arabic content culturally appropriate?', answer: 'Yes. The AI is specifically trained to respect GCC cultural norms, avoiding sensitive topics and maintaining appropriate tone for the region.' },
    ],
    demoVideoUrl: '',
  },

  {
    name: 'TikTok Agent',
    slug: 'tiktok-agent',
    description: 'Fully automated TikTok content pipeline. Researches trending sounds and topics, generates short-form video content, writes viral captions and auto-publishes daily.',
    tagline: 'Automate your TikTok growth with AI',
    moduleType: 'agent', category: 'tiktok', pipelineType: 'tiktok', outputType: 'video',
    icon: '🎵', color: '#010101', badge: 'Coming Soon', sortOrder: 4,
    isActive: true, isComingSoon: true,
    nicheSlug: 'content_social', pipelineCategory: 'standalone', availableIn: ['UAE', 'Kenya'],
    requiredApiKeys: ['openai', 'atlas', 'tiktok'],
    estimatedCostPerRun: '$1-2 Per Video',
    platforms: ['tiktok'],
    capabilities: ['Trending sound detection', 'Viral hook generation', 'Short-form video creation', 'Auto captions & subtitles', 'Hashtag research', 'Optimal posting times', 'Cross-platform repurposing', 'Analytics tracking'],
    pricing: { monthly: 39, annual: 29, features: ['1-3 TikTok videos per day', 'Viral trend detection', 'Short-form video generation', 'Auto captions & subtitles', 'Optimal posting times', 'Instagram Reels repurposing', 'YouTube Shorts repurposing', 'Arabic + English support', 'Email notifications', 'Priority support'], hasCustomPlan: true, customLabel: 'Need TikTok automation across multiple accounts or markets?' },
    heroStats: [{ label: 'Videos per day', value: '1-3' }, { label: 'Cost per video', value: '$1-2' }, { label: 'Avg views', value: 'Growing' }, { label: 'Languages', value: 'EN + AR' }],
    features: [
      { icon: '🔥', title: 'Viral Trend Detection', description: 'Scans TikTok For You Page daily for trending sounds, formats and topics in your niche. Always riding the wave — never behind the curve.' },
      { icon: '🎬', title: 'Short-Form Video Creation', description: 'Generates punchy 15-60 second vertical videos with dynamic cuts, text overlays and on-trend visual style.' },
      { icon: '💬', title: 'Auto Captions & Subtitles', description: 'Burns subtitles directly into the video for silent viewing. Increases watch time and accessibility across all audiences.' },
      { icon: '⏰', title: 'Optimal Posting Times', description: 'Publishes at the exact times your target audience is most active. No more guessing — data-driven scheduling every day.' },
      { icon: '🔁', title: 'Cross-Platform Repurposing', description: 'Automatically repurposes TikTok content for Instagram Reels and YouTube Shorts. One piece of content, three platforms.' },
      { icon: '📈', title: 'Analytics & Learning', description: 'Tracks views, likes, shares and completion rate. Agent learns what resonates and continuously improves content quality.' },
    ],
    howItWorks: [
      { step: '1', title: 'Trend and topic research', description: 'Agent monitors TikTok For You Page and trending hashtags daily in your niche. Selects the best performing content format and topic.' },
      { step: '2', title: 'Video script and clips created', description: 'AI writes a punchy short-form script. Generates vertical video clips with dynamic cuts and adds trending audio automatically.' },
      { step: '3', title: 'Captions and hashtags added', description: 'Burns subtitles into the video. Writes engaging TikTok captions with trending hashtags to maximize organic discovery.' },
      { step: '4', title: 'Published at peak time', description: 'Video uploaded to TikTok at the optimal time for your audience. Automatically repurposed to Instagram Reels and YouTube Shorts.' },
    ],
    faq: [
      { question: 'Do I need a TikTok Business account?', answer: 'Yes, you need a TikTok Business account with API access. We provide a step-by-step guide to connect your account in under 5 minutes.' },
      { question: 'Can it post in Arabic?', answer: 'Yes. Full Arabic caption and script support for GCC TikTok audiences. Gulf dialect content performs exceptionally well on TikTok.' },
      { question: 'Will it also post to Instagram and YouTube?', answer: 'Yes. Each TikTok video is automatically repurposed and posted to Instagram Reels and YouTube Shorts for maximum reach.' },
      { question: 'How many videos per day?', answer: 'Default is 1 video per day. You can increase to 3 per day for more aggressive growth strategies.' },
    ],
    demoVideoUrl: '',
  },

  {
    name: 'Podcast Agent',
    slug: 'podcast-agent',
    description: 'AI-powered podcast production pipeline. Researches trending topics, writes full episode scripts, generates natural-sounding audio, creates cover art and distributes to Spotify, Apple Podcasts and more.',
    tagline: 'Launch and grow your podcast on autopilot',
    moduleType: 'agent', category: 'podcast', pipelineType: 'podcast', outputType: 'audio',
    icon: '🎙️', color: '#8b5cf6', badge: 'Coming Soon', sortOrder: 5,
    isActive: true, isComingSoon: true,
    nicheSlug: 'content_social', pipelineCategory: 'standalone', availableIn: ['UAE', 'Kenya'],
    requiredApiKeys: ['openai', 'spotify'],
    estimatedCostPerRun: '$0.50-1 Per Episode',
    platforms: ['spotify', 'youtube'],
    capabilities: ['Topic research & scripting', 'AI voice generation', 'Multi-speaker support', 'Show notes creation', 'Cover art generation', 'RSS feed management', 'Multi-platform distribution', 'Transcript generation'],
    pricing: { monthly: 39, annual: 29, features: ['3-7 episodes per week', 'AI script writing', 'Multi-voice narration', 'Show notes generation', 'Cover art creation', 'Spotify + Apple distribution', 'RSS feed management', 'Transcript generation', 'Arabic + English support', 'Email notifications', 'Priority support'], hasCustomPlan: true, customLabel: 'Need podcast automation for multiple shows or a podcast network?' },
    heroStats: [{ label: 'Episodes per week', value: '3-7' }, { label: 'Cost per episode', value: '<$1' }, { label: 'Platforms', value: '5+' }, { label: 'Languages', value: 'EN + AR' }],
    features: [
      { icon: '🔍', title: 'Topic Research & Scripting', description: 'AI researches trending podcast topics in your niche daily. Writes full episode scripts with natural conversation flow, key talking points and strong hooks.' },
      { icon: '🎙️', title: 'AI Voice Generation', description: 'Multi-voice AI narration that sounds natural and professional. Supports solo host, dual-host and interview formats with distinct voices.' },
      { icon: '📝', title: 'Show Notes Creation', description: 'Automatically generates detailed show notes with timestamps, key takeaways, links and SEO-optimized descriptions for every episode.' },
      { icon: '🎨', title: 'Cover Art Generation', description: 'Creates professional podcast cover art for each episode. Branded, eye-catching and optimized for podcast platform thumbnails.' },
      { icon: '📡', title: 'Multi-Platform Distribution', description: 'Distributes to Spotify, Apple Podcasts, YouTube Podcasts, Amazon Music and RSS simultaneously. One upload, everywhere.' },
      { icon: '📄', title: 'Transcript Generation', description: 'Generates full episode transcripts automatically. Improves SEO, accessibility and allows listeners to follow along in text.' },
    ],
    howItWorks: [
      { step: '1', title: 'Topic research and scripting', description: 'Agent researches trending topics in your podcast niche daily. Writes a full episode script with natural dialogue, hooks, key points and a compelling close.' },
      { step: '2', title: 'Audio production', description: 'AI voices narrate the script with natural pacing and emotion. Background music added. Audio mastered and exported as broadcast-quality MP3.' },
      { step: '3', title: 'Show notes and artwork created', description: 'Detailed show notes written with timestamps and key takeaways. Episode cover art generated automatically in your brand style.' },
      { step: '4', title: 'Distributed to all platforms', description: 'Episode uploaded and published to Spotify, Apple Podcasts, YouTube and RSS simultaneously. You receive a notification when live.' },
    ],
    faq: [
      { question: 'Do I need existing podcast accounts?', answer: 'Yes. You need accounts on Spotify for Podcasters and Apple Podcasts Connect. We provide setup guides for all platforms.' },
      { question: 'Can it create Arabic podcasts?', answer: 'Yes. Full Arabic script writing and Arabic TTS voices are supported. Perfect for GCC podcast audiences.' },
      { question: 'How long are the episodes?', answer: 'Default episode length is 20-40 minutes. You can configure shorter (10-15 min) or longer (45-60 min) formats.' },
      { question: 'Can I use my own voice?', answer: 'Coming soon. Currently the agent uses AI voices. Voice cloning to use your own voice is on our roadmap.' },
    ],
    demoVideoUrl: '',
  },

  {
    name: 'WhatsApp Sales Agent',
    slug: 'whatsapp-sales-agent',
    description: 'AI-powered WhatsApp agent that qualifies leads, answers questions, books appointments and closes sales automatically — in Arabic and English, 24/7.',
    tagline: 'Never miss a lead on WhatsApp again',
    moduleType: 'agent', category: 'sales', pipelineType: 'whatsapp', outputType: 'messages',
    icon: '💬', color: '#25d366', badge: 'Coming Soon', sortOrder: 6,
    isActive: true, isComingSoon: true,
    nicheSlug: 'real_estate', pipelineCategory: 'standalone', availableIn: ['UAE', 'Kenya'],
    requiredApiKeys: ['openai', 'whatsapp'],
    estimatedCostPerRun: '$0.01 Per Message',
    platforms: ['whatsapp'],
    capabilities: ['Lead qualification', 'Arabic + English support', 'Appointment booking', 'Product catalogue sharing', 'Payment link sending', 'CRM integration', 'Follow-up sequences', 'Handoff to human agent'],
    pricing: { monthly: 99, annual: 79, features: ['Unlimited WhatsApp conversations', 'Lead qualification & scoring', 'Appointment booking', 'Product catalogue sharing', 'Payment link generation', 'Arabic + English support', 'Follow-up sequences', 'CRM integration', 'Human handoff', 'Email notifications', 'Priority support'], hasCustomPlan: true, customLabel: 'Need WhatsApp automation for a large sales team or enterprise?' },
    heroStats: [{ label: 'Response time', value: '<5 sec' }, { label: 'Languages', value: 'AR + EN' }, { label: 'Availability', value: '24/7' }, { label: 'Lead conversion', value: '+40%' }],
    features: [
      { icon: '🎯', title: 'Lead Qualification', description: 'Automatically qualifies incoming leads with smart questions. Scores each prospect by budget, timeline and intent before routing to your sales team.' },
      { icon: '🌍', title: 'Arabic + English Support', description: 'Responds fluently in both Arabic and English. Detects customer language automatically and switches seamlessly for GCC and international clients.' },
      { icon: '📅', title: 'Appointment Booking', description: 'Books meetings, viewings and calls directly in WhatsApp. Syncs with your calendar and sends confirmation messages automatically.' },
      { icon: '📦', title: 'Product Catalogue Sharing', description: 'Sends product images, pricing and specifications automatically based on customer interest. No manual searching required.' },
      { icon: '💳', title: 'Payment Link Sending', description: 'Generates and sends payment links directly in WhatsApp. Customers can pay without leaving the chat — zero friction checkout.' },
      { icon: '🔄', title: 'Follow-Up Sequences', description: 'Sends automated follow-up messages to leads who did not respond. Customizable sequences to nurture prospects until they are ready to buy.' },
    ],
    howItWorks: [
      { step: '1', title: 'Lead sends a WhatsApp message', description: 'Customer messages your WhatsApp number. The agent responds instantly — within 5 seconds — in their language, 24 hours a day, 7 days a week.' },
      { step: '2', title: 'Agent qualifies the lead', description: 'Smart questions determine budget, timeline and intent. Lead is scored automatically and high-value prospects are flagged for immediate human follow-up.' },
      { step: '3', title: 'Appointment or purchase facilitated', description: 'Agent books appointments, shares product catalogues, sends pricing and even generates payment links — all within the WhatsApp conversation.' },
      { step: '4', title: 'Handoff and follow-up', description: 'Qualified leads are handed off to your sales team with a full conversation summary. Unresponsive leads enter automated follow-up sequences.' },
    ],
    faq: [
      { question: 'Do I need a WhatsApp Business API account?', answer: 'Yes. You need a WhatsApp Business API account through an approved Business Solution Provider. We help you set this up as part of onboarding.' },
      { question: 'Can it handle multiple conversations at once?', answer: 'Yes. The agent handles unlimited simultaneous conversations with no degradation in quality or response time.' },
      { question: 'Is it compliant with WhatsApp terms?', answer: 'Yes. We only use the official WhatsApp Business API. No unofficial tools or automation that violates WhatsApp policies.' },
    ],
    demoVideoUrl: '',
  },

  {
    name: 'Real Estate Agent',
    slug: 'real-estate-agent',
    description: 'AI agent built for UAE real estate. Qualifies buyers and renters, recommends properties, schedules viewings, sends proposals and nurtures leads automatically via WhatsApp and email.',
    tagline: 'Close more property deals with AI automation',
    moduleType: 'agent', category: 'real_estate', pipelineType: 'real_estate', outputType: 'leads',
    icon: '🏙️', color: '#f59e0b', badge: 'Coming Soon', sortOrder: 7,
    isActive: true, isComingSoon: true,
    nicheSlug: 'real_estate', pipelineCategory: 'standalone', availableIn: ['UAE', 'Kenya'],
    requiredApiKeys: ['openai', 'whatsapp'],
    estimatedCostPerRun: '$0.05 Per Lead',
    platforms: ['whatsapp', 'email', 'web'],
    capabilities: ['Lead qualification & scoring', 'Property matching AI', 'Viewing scheduling', 'Arabic + English support', 'Automated follow-ups', 'ROI & yield calculations', 'CRM sync', 'Market insights'],
    pricing: { monthly: 149, annual: 119, features: ['Unlimited lead conversations', 'AI property matching', 'WhatsApp lead nurturing', 'Viewing scheduler', 'ROI & yield calculator', 'Lead scoring & routing', 'Automated follow-up sequences', 'CRM integration', 'Arabic + English support', 'Email notifications', 'Dedicated onboarding support'], hasCustomPlan: true, customLabel: 'Need a custom real estate AI solution for a large agency or developer?' },
    heroStats: [{ label: 'Lead response', value: 'Instant' }, { label: 'Languages', value: 'AR + EN' }, { label: 'Market', value: 'UAE + GCC' }, { label: 'ROI Increase', value: '+60%' }],
    features: [
      { icon: '🏠', title: 'Property Matching AI', description: 'Matches buyers and renters to the most suitable properties based on their budget, location preference, lifestyle and requirements automatically.' },
      { icon: '📱', title: 'WhatsApp Lead Nurturing', description: 'Engages leads on WhatsApp in Arabic and English. Qualifies buyers, answers property questions and books viewings without human involvement.' },
      { icon: '📅', title: 'Viewing Scheduler', description: 'Books property viewings automatically in your team calendar. Sends confirmation, reminders and directions to prospects automatically.' },
      { icon: '💰', title: 'ROI & Yield Calculator', description: 'Instantly calculates rental yield, ROI and projected returns for investment property enquiries. Turns browsers into serious buyers.' },
      { icon: '📊', title: 'Lead Scoring & Routing', description: 'Scores every lead by intent, budget and timeline. High-value investors and serious buyers get instant priority routing to your top agents.' },
      { icon: '🔄', title: 'Automated Follow-Ups', description: 'Sends personalized follow-up sequences to leads who went cold. Market updates, new listings and price reductions re-engage prospects automatically.' },
    ],
    howItWorks: [
      { step: '1', title: 'Lead enquiries via WhatsApp or Web', description: 'Prospect messages your WhatsApp or fills in a web form. Agent responds instantly in their language — Arabic or English — with personalized property options.' },
      { step: '2', title: 'Qualification and property matching', description: 'AI asks smart questions to understand budget, location, property type and timeline. Matches the lead to the best available properties in your inventory.' },
      { step: '3', title: 'Viewing schedules automatically', description: 'Agent books a viewing or call directly in the conversation. Sends confirmation to both the lead and your agent. Calendar sync included.' },
      { step: '4', title: 'Follow-up and deal nurturing', description: 'After the viewing, agent sends follow-ups, ROI calculations and comparisons. Keeps the lead warm until they are ready to make an offer.' },
    ],
    faq: [
      { question: 'Does it work with our existing CRM?', answer: 'Yes. The agent integrates with major CRMs including Salesforce, HubSpot and local UAE CRMs. Custom integrations are also available.' },
      { question: 'Can it handle Arabic-speaking clients?', answer: 'Yes. Full native Arabic support including Gulf dialect. The agent automatically detects the client language and responds accordingly.' },
      { question: 'How does it connect to our property listings?', answer: 'We connect to your property management system or CRM to access live inventory. The agent always shows accurate, up-to-date availability.' },
    ],
    demoVideoUrl: '',
  },

  {
    name: 'Customer Support Agent',
    slug: 'customer-support-agent',
    description: 'AI-powered customer support that handles 80% of queries automatically. Connects to your knowledge base, resolves tickets, escalates complex issues and works in Arabic and English 24/7.',
    tagline: 'Cut support costs by 60% with AI',
    moduleType: 'agent', category: 'support', pipelineType: 'support', outputType: 'messages',
    icon: '🎧', color: '#3b82f6', badge: 'Coming Soon', sortOrder: 8,
    isActive: true, isComingSoon: true,
    nicheSlug: 'internal_copilot', pipelineCategory: 'standalone', availableIn: ['UAE', 'Kenya'],
    requiredApiKeys: ['openai'],
    estimatedCostPerRun: '$0.01 Per Ticket',
    platforms: ['whatsapp', 'email', 'web', 'instagram'],
    capabilities: ['Knowledge base integration', 'Ticket auto-resolution', 'Arabic + English support', 'Sentiment analysis', 'Escalation workflows', 'Multi-channel support', 'CSAT tracking', 'CRM integration'],
    pricing: { monthly: 99, annual: 79, features: ['Unlimited support conversations', 'Knowledge base integration', '80% auto-resolution rate', 'Multilingual support (AR + EN)', 'Sentiment analysis', 'Escalation workflows', 'CSAT tracking', 'CRM integration', 'Multi-channel support', 'Email notifications', 'Priority support'], hasCustomPlan: true, customLabel: 'Need enterprise-grade support automation with custom SLA and integrations?' },
    heroStats: [{ label: 'Queries resolved', value: '80%' }, { label: 'Response time', value: '<3 seconds' }, { label: 'Cost reduction', value: '60%' }, { label: 'Languages', value: 'AR + EN' }],
    features: [
      { icon: '📚', title: 'Knowledge Base Integration', description: 'Connects to your existing FAQs, documentation, product manuals and policies. Answers questions accurately using your actual business information.' },
      { icon: '🎫', title: 'Ticket Auto-Resolution', description: 'Automatically resolves 80% of common support queries without human involvement. Only complex or sensitive issues are escalated to your team.' },
      { icon: '🌍', title: 'Multilingual Support', description: 'Responds in Arabic, English and 50+ other languages. Detects customer language automatically and maintains consistent quality across all languages.' },
      { icon: '😊', title: 'Sentiment Analysis', description: 'Monitors customer sentiment in real time. Frustrated customers are automatically prioritized and escalated to human agents before situations worsen.' },
      { icon: '📊', title: 'CSAT Tracking', description: 'Collects customer satisfaction scores automatically after each resolved ticket. Tracks trends over time and flags areas for improvement.' },
      { icon: '🔗', title: 'CRM Integration', description: 'Logs every interaction in your CRM automatically. Full conversation history, ticket status and resolution notes synced without manual data entry.' },
    ],
    howItWorks: [
      { step: '1', title: 'Customer submits a query', description: 'Customer contacts you via WhatsApp, email, website chat or Instagram DM. Agent responds instantly in their language — 24 hours a day, 7 days a week.' },
      { step: '2', title: 'Query understood and resolved', description: 'AI searches your knowledge base for the best answer. Resolves 80% of queries instantly without any human involvement needed.' },
      { step: '3', title: 'Complex issues escalated', description: 'Queries outside the agent knowledge or flagged as sensitive are escalated to your human team with full conversation context and suggested resolution.' },
      { step: '4', title: 'Feedback collected automatically', description: 'After resolution, agent requests a satisfaction rating. Data is logged in your CRM and monthly performance reports are generated automatically.' },
    ],
    faq: [
      { question: 'How does it learn about our products?', answer: 'You provide your FAQs, product documentation and support policies during onboarding. The agent is trained on your specific business information.' },
      { question: 'What happens if it cannot answer a question?', answer: 'It immediately escalates to your human team with full context. The agent never leaves a customer without a response or next step.' },
      { question: 'Is customer data secure?', answer: 'Yes. All conversations are encrypted and handled in compliance with UAE data protection regulations and GDPR standards.' },
    ],
    demoVideoUrl: '',
  },

  // ── STANDALONE AUTOMATIONS ────────────────────────────────────────────────

  {
    name: 'Social Media Scheduler',
    slug: 'social-media-scheduler',
    description: 'Automatically schedules and publishes content across Instagram, TikTok, LinkedIn and Twitter. Finds optimal posting times, auto-generates captions and manages your entire content calendar.',
    tagline: 'One dashboard to rule all your social media',
    moduleType: 'automation', category: 'social_media', pipelineType: 'social_scheduler', outputType: 'posts',
    icon: '📅', color: '#7c3aed', badge: 'Coming Soon', sortOrder: 9,
    isActive: true, isComingSoon: true,
    nicheSlug: 'content_social', pipelineCategory: 'standalone', availableIn: ['UAE', 'Kenya'],
    requiredApiKeys: ['openai'],
    estimatedCostPerRun: '$0.10 Per Post',
    platforms: ['instagram', 'tiktok', 'linkedin', 'twitter'],
    capabilities: ['Multi-platform publishing', 'Optimal time detection', 'AI caption generation', 'Content calendar', 'Hashtag automation', 'Analytics dashboard', 'Bulk scheduling', 'Arabic + English'],
    pricing: { monthly: 29, annual: 19, features: ['Unlimited scheduled posts', '6+ social media platforms', 'AI caption generation', 'Optimal time detection', 'Content calendar', 'Bulk scheduling', 'Hashtag automation', 'Unified analytics dashboard', 'Arabic + English support', 'Email notifications'], hasCustomPlan: true, customLabel: 'Need social media scheduling for an agency managing multiple clients?' },
    heroStats: [{ label: 'Platforms', value: '6+' }, { label: 'Posts per day', value: 'Unlimited' }, { label: 'Time saved', value: '10h/week' }, { label: 'Languages', value: 'EN + AR' }],
    features: [
      { icon: '🗓️', title: 'Content Calendar', description: 'Visual drag-and-drop content calendar. Plan weeks of content in advance across all platforms from one unified dashboard.' },
      { icon: '🤖', title: 'AI Caption Generation', description: 'Automatically generates platform-native captions for each network. LinkedIn professional tone, Instagram engaging, TikTok punchy — all from one brief.' },
      { icon: '⏰', title: 'Optimal Time Detection', description: 'Analyzes your audience data to find the exact times each post will get maximum reach and engagement on each platform.' },
      { icon: '🔁', title: 'Bulk Scheduling', description: 'Upload and schedule hundreds of posts at once. CSV import, bulk editing and batch scheduling save hours of manual work every week.' },
      { icon: '#️⃣', title: 'Hashtag Automation', description: 'Researches and attaches optimal hashtags for each platform and post automatically. Stays current with trending tags in your niche.' },
      { icon: '📊', title: 'Unified Analytics', description: 'All your social media analytics in one dashboard. Track reach, engagement, follower growth and best-performing content across every platform.' },
    ],
    howItWorks: [
      { step: '1', title: 'Connect your social accounts', description: 'Connect Instagram, TikTok, LinkedIn, Twitter and Facebook in one click. OAuth authentication — no passwords stored, fully secure.' },
      { step: '2', title: 'Create or import your content', description: 'Upload your content or let the AI generate captions from your images and videos. Bulk import from CSV or Google Drive supported.' },
      { step: '3', title: 'Schedule across platforms', description: 'Set your posting schedule once. The automation handles publishing to every platform at the optimal time automatically every day.' },
      { step: '4', title: 'Monitor and optimize', description: 'Review unified analytics weekly. See what content performs best on each platform and let the AI recommend your optimal content strategy.' },
    ],
    faq: [
      { question: 'Which platforms are supported?', answer: 'Instagram, TikTok, LinkedIn, Twitter/X, Facebook and YouTube. More platforms being added regularly.' },
      { question: 'Can it generate content as well as schedule it?', answer: 'Yes. The AI can generate captions, suggest hashtags and even recommend content ideas based on your niche and trending topics.' },
      { question: 'Does it work with Arabic content?', answer: 'Yes. Full Arabic caption support and RTL text formatting for Instagram and other platforms that support it.' },
    ],
    demoVideoUrl: '',
  },

  {
    name: 'Email Marketing Automation',
    slug: 'email-marketing-automation',
    description: 'AI-powered email campaigns that write themselves. Builds sequences, personalizes content for each subscriber, optimizes send times and tracks conversions automatically.',
    tagline: 'Email campaigns that write and send themselves',
    moduleType: 'automation', category: 'email', pipelineType: 'email_marketing', outputType: 'emails',
    icon: '📧', color: '#f59e0b', badge: 'Coming Soon', sortOrder: 10,
    isActive: true, isComingSoon: true,
    nicheSlug: 'marketing', pipelineCategory: 'standalone', availableIn: ['UAE', 'Kenya'],
    requiredApiKeys: ['openai'],
    estimatedCostPerRun: '$0.001 Per Email',
    platforms: ['email'],
    capabilities: ['AI email copywriting', 'Sequence automation', 'Personalization at scale', 'A/B testing', 'Send time optimization', 'Conversion tracking', 'List segmentation', 'Arabic + English'],
    pricing: { monthly: 29, annual: 19, features: ['Unlimited email sequences', 'AI email copywriting', 'Personalization at scale', 'A/B testing automation', 'Send time optimization', 'Conversion tracking', 'Multiple ESP integrations', 'Arabic + English support', 'Unsubscribe management', 'GDPR compliant', 'Email notifications'], hasCustomPlan: true, customLabel: 'Need email automation for a large list or enterprise marketing team?' },
    heroStats: [{ label: 'Open rate boost', value: '+35%' }, { label: 'Cost per email', value: '<$0.001' }, { label: 'Sequences', value: 'Unlimited' }, { label: 'Languages', value: 'EN + AR' }],
    features: [
      { icon: '✍️', title: 'AI Email Copywriting', description: 'Writes high-converting email copy automatically. Subject lines, body copy and CTAs all optimized for your audience and goal.' },
      { icon: '🔄', title: 'Sequence Automation', description: 'Build multi-step email sequences that run automatically. Welcome series, abandoned cart, post-purchase, re-engagement — all set up once and run forever.' },
      { icon: '👤', title: 'Personalization at Scale', description: 'Personalizes every email with subscriber name, location, purchase history and behavior data. Feels handwritten — delivered at scale.' },
      { icon: '🧪', title: 'A/B Testing', description: 'Automatically tests subject lines, send times, content and CTAs. Learns what works for your audience and optimizes future campaigns automatically.' },
      { icon: '⏰', title: 'Send Time Optimization', description: 'AI predicts the best time to send each email to each individual subscriber. Dramatically improves open and click rates.' },
      { icon: '📊', title: 'Conversion Tracking', description: 'Tracks opens, clicks, conversions and revenue attributed to each campaign. Full funnel visibility from email send to final purchase.' },
    ],
    howItWorks: [
      { step: '1', title: 'Connect your email list', description: 'Import your subscriber list via CSV or connect directly to Mailchimp, Klaviyo, HubSpot or your existing email provider via API.' },
      { step: '2', title: 'Set up your sequences', description: 'Choose from pre-built templates or build custom sequences. Define triggers, delays and conditions. The AI writes the copy for every email automatically.' },
      { step: '3', title: 'Automation runs on autopilot', description: 'New subscribers enter your sequences automatically. The right email is sent to the right person at the right time — completely hands off.' },
      { step: '4', title: 'Optimize with AI insights', description: 'Weekly performance reports highlight your best-performing emails. AI recommendations show exactly how to improve open rates and conversions.' },
    ],
    faq: [
      { question: 'Which email providers does it integrate with?', answer: 'Mailchimp, Klaviyo, HubSpot, ActiveCampaign, Brevo and any provider with an API. Custom integrations available on request.' },
      { question: 'Can it write emails in Arabic?', answer: 'Yes. Full Arabic email copywriting for GCC audiences. Right-to-left formatting handled automatically in supported email clients.' },
    ],
    demoVideoUrl: '',
  },

  {
    name: 'Lead Generation Automation',
    slug: 'lead-generation-automation',
    description: 'Automatically finds, qualifies and enriches leads from LinkedIn, web scraping and social media. Builds targeted prospect lists and triggers personalized outreach sequences.',
    tagline: 'Fill your pipeline with qualified leads automatically',
    moduleType: 'automation', category: 'sales', pipelineType: 'lead_generation', outputType: 'leads',
    icon: '🎯', color: '#22c55e', badge: 'Coming Soon', sortOrder: 11,
    isActive: true, isComingSoon: true,
    nicheSlug: 'marketing', pipelineCategory: 'standalone', availableIn: ['UAE', 'Kenya'],
    requiredApiKeys: ['openai'],
    estimatedCostPerRun: '$0.05 Per Lead',
    platforms: ['linkedin', 'email', 'web'],
    capabilities: ['LinkedIn prospecting', 'Lead enrichment', 'Email finding', 'Qualification scoring', 'Outreach sequences', 'CRM auto-sync', 'UAE/GCC targeting', 'Arabic outreach'],
    pricing: { monthly: 49, annual: 39, features: ['50-200 qualified leads per day', 'LinkedIn prospecting', 'Email finder & verification', 'AI lead scoring', 'Personalized outreach sequences', 'CRM auto-sync', 'UAE & GCC targeting', 'Arabic + English outreach', 'Multi-touch follow-up', 'Performance analytics', 'Email notifications'], hasCustomPlan: true, customLabel: 'Need lead generation at enterprise scale across multiple markets?' },
    heroStats: [{ label: 'Leads per day', value: '50-200' }, { label: 'Cost per lead', value: '$0.05' }, { label: 'Qualification', value: 'AI-scored' }, { label: 'Market', value: 'GCC + Global' }],
    features: [
      { icon: '🔍', title: 'LinkedIn Prospecting', description: 'Automatically finds and qualifies prospects on LinkedIn matching your ideal customer profile. Filters by industry, company size, location and job title.' },
      { icon: '📧', title: 'Email Finder', description: 'Finds verified business email addresses for prospects automatically. 95%+ email verification rate to protect your sender reputation.' },
      { icon: '⭐', title: 'Lead Scoring', description: 'AI scores every lead by fit, intent and engagement signals. Your sales team focuses only on the highest-value prospects.' },
      { icon: '📤', title: 'Outreach Sequences', description: 'Sends personalized outreach emails and LinkedIn messages automatically. Multi-touch sequences that feel human — not spammy.' },
      { icon: '🔗', title: 'CRM Auto-Sync', description: 'All leads, contact data and interaction history synced to your CRM automatically. No manual data entry ever required.' },
      { icon: '🇦🇪', title: 'UAE & GCC Targeting', description: 'Specialized targeting for UAE, Saudi Arabia, Kuwait and GCC markets. Finds decision makers at local and regional companies efficiently.' },
    ],
    howItWorks: [
      { step: '1', title: 'Define your ideal customer', description: 'Set your target — industry, company size, job title, location and budget. The automation builds your ideal customer profile and starts prospecting immediately.' },
      { step: '2', title: 'Leads found and enriched', description: 'Automation scans LinkedIn and the web for matching prospects. Finds verified emails, enriches contact data and scores each lead automatically.' },
      { step: '3', title: 'Personalized outreach sent', description: 'AI writes and sends personalized outreach messages to each prospect. Multi-step sequences run automatically over days and weeks.' },
      { step: '4', title: 'Qualified leads delivered', description: 'Positive responses and interested prospects are flagged and delivered to your CRM with full context. Your team closes — the automation fills the pipe.' },
    ],
    faq: [
      { question: 'Is LinkedIn prospecting allowed?', answer: 'We operate within LinkedIn terms of service using approved methods. We do not use scraping tools that violate platform policies.' },
      { question: 'How many leads can it find per day?', answer: '50-200 qualified leads per day depending on your target market size and criteria. Volume scales with your subscription tier.' },
    ],
    demoVideoUrl: '',
  },

  {
    name: 'Content Repurposing Automation',
    slug: 'content-repurposing-automation',
    description: 'Takes one piece of content and automatically turns it into 10+ formats. Upload a YouTube video or blog post — get LinkedIn posts, tweets, email newsletters, Instagram captions and more.',
    tagline: 'Create once. Publish everywhere. Automatically.',
    moduleType: 'automation', category: 'content', pipelineType: 'content_repurposing', outputType: 'content',
    icon: '♻️', color: '#06b6d4', badge: 'Coming Soon', sortOrder: 12,
    isActive: true, isComingSoon: true,
    nicheSlug: 'content_social', pipelineCategory: 'standalone', availableIn: ['UAE', 'Kenya'],
    requiredApiKeys: ['openai'],
    estimatedCostPerRun: '$0.20 Per Content Piece',
    platforms: ['youtube', 'linkedin', 'twitter', 'instagram', 'email'],
    capabilities: ['Video to blog post', 'Blog to social posts', 'Auto-threading for X/Twitter', 'LinkedIn article creation', 'Email newsletter generation', 'Instagram caption writing', 'Arabic + English output', 'SEO optimization'],
    pricing: { monthly: 29, annual: 19, features: ['Unlimited content pieces', '10+ formats per piece', 'Video to blog post', 'Blog to social posts', 'Twitter/X thread generator', 'LinkedIn article creation', 'Email newsletter generation', 'Batch processing', 'Arabic + English output', 'Brand voice matching', 'Email notifications'], hasCustomPlan: true, customLabel: 'Need content repurposing at agency scale across multiple brands?' },
    heroStats: [{ label: 'Formats generated', value: '10+' }, { label: 'Time saved', value: '5h per piece' }, { label: 'Platforms', value: '6+' }, { label: 'Languages', value: 'EN + AR' }],
    features: [
      { icon: '🎬', title: 'Video to Blog Post', description: 'Automatically transcribes YouTube videos and converts them into SEO-optimized long-form blog posts. Complete with headers, formatting and meta descriptions.' },
      { icon: '🐦', title: 'Blog to Social Posts', description: 'Takes any blog post or article and generates platform-native social posts for LinkedIn, Twitter, Instagram and Facebook automatically.' },
      { icon: '🧵', title: 'Twitter / X Thread Creator', description: 'Converts long-form content into engaging Twitter threads automatically. Numbered, punchy and formatted for maximum engagement and virality.' },
      { icon: '💼', title: 'LinkedIn Article Generator', description: 'Transforms your content into professional LinkedIn articles with proper formatting, headers and thought leadership positioning.' },
      { icon: '📧', title: 'Email Newsletter Creation', description: 'Converts your weekly content into a curated email newsletter automatically. Introduction, content summary, key takeaways and CTA — all generated.' },
      { icon: '♻️', title: 'Batch Processing', description: 'Process multiple pieces of content simultaneously. Upload 10 videos at once and receive 100+ social posts, threads and articles in minutes.' },
    ],
    howItWorks: [
      { step: '1', title: 'Submit your source content', description: 'Upload a YouTube video, paste a blog URL, or upload a document. The automation processes any content format automatically.' },
      { step: '2', title: 'AI analyses and extracts', description: 'AI transcribes video, extracts key points, identifies the most shareable insights and structures content for each target platform.' },
      { step: '3', title: '10+ formats generated', description: 'Platform-native content created simultaneously — blog post, LinkedIn article, Twitter thread, Instagram captions, email newsletter and more.' },
      { step: '4', title: 'Review and publish', description: 'Content delivered to your dashboard for one-click publishing or direct auto-publish to connected accounts. All done in minutes.' },
    ],
    faq: [
      { question: 'What source formats are supported?', answer: 'YouTube videos, blog posts (URL), Word documents, PDFs, podcast audio files and plain text. More formats being added.' },
      { question: 'Does it maintain my brand voice?', answer: 'Yes. You provide 3-5 examples of your existing content during setup. The AI learns your tone, style and vocabulary and maintains it across all outputs.' },
      { question: 'Can it repurpose Arabic content?', answer: 'Yes. Full Arabic to Arabic repurposing supported. Can also translate English content to Arabic and vice versa.' },
    ],
    demoVideoUrl: '',
  },

  // ── NICHE PIPELINE ────────────────────────────────────────────────────────

  {
    name: 'Real Estate Pipeline',
    slug: 'real-estate-pipeline',
    description: 'Complete AI-powered real estate automation suite. WhatsApp lead capture, AI qualification, property matching, viewing scheduling and CRM sync — all connected as one pipeline.',
    tagline: 'End-to-end real estate automation in one package',
    moduleType: 'agent', category: 'real_estate', pipelineType: 'real_estate', outputType: 'leads',
    icon: '🏢', color: '#0ea5e9', badge: 'Coming Soon', sortOrder: 20,
    isActive: true, isComingSoon: true,
    nicheSlug: 'real_estate', pipelineCategory: 'niche_pipeline', availableIn: ['UAE', 'Kenya'],
    requiredApiKeys: ['openai', 'whatsapp'],
    estimatedCostPerRun: '$0.10 Per Lead',
    platforms: ['whatsapp', 'email', 'web'],
    capabilities: ['WhatsApp lead capture', 'AI lead qualification', 'Property matching', 'Viewing scheduler', 'Follow-up sequences', 'CRM sync', 'ROI calculator', 'Arabic + English'],
    components: [
      { key: 'whatsapp-sales-agent', name: 'WhatsApp Sales Agent', description: 'Captures and qualifies leads via WhatsApp in Arabic and English', icon: '💬', isRequired: true, sortOrder: 1 },
      { key: 'real-estate-agent', name: 'Real Estate Agent', description: 'Matches properties, schedules viewings and nurtures leads', icon: '🏙️', isRequired: true, sortOrder: 2 },
      { key: 'lead-generation-automation', name: 'Lead Generation', description: 'Proactively sources new leads from LinkedIn and social media', icon: '🎯', isRequired: false, sortOrder: 3 },
    ],
    pricing: { monthly: 199, annual: 159, features: ['All 3 pipeline components', 'Unlimited WhatsApp conversations', 'AI property matching', 'Viewing scheduler', 'ROI & yield calculator', 'Lead scoring & routing', 'CRM integration', 'Arabic + English support', 'Dedicated onboarding', 'Priority support'], hasCustomPlan: true, customLabel: 'Need a custom real estate AI solution for a large agency or developer?' },
    heroStats: [{ label: 'Components', value: '3 agents' }, { label: 'Lead response', value: 'Instant' }, { label: 'Languages', value: 'AR + EN' }, { label: 'Conversion boost', value: '+60%' }],
    features: [
      { icon: '💬', title: 'WhatsApp Lead Capture', description: 'Instant response to every WhatsApp enquiry in Arabic or English. Qualifies budget, timeline and property type automatically.' },
      { icon: '🏠', title: 'AI Property Matching', description: 'Matches qualified leads to your best-fit listings instantly. Sends property cards, pricing and availability without human involvement.' },
      { icon: '📅', title: 'Viewing & Appointment Scheduler', description: 'Books viewings directly in the conversation. Sends confirmations, reminders and directions automatically.' },
      { icon: '🎯', title: 'Proactive Lead Generation', description: 'Finds and outreaches to new prospects on LinkedIn and social media. Fills your pipeline even when enquiries are slow.' },
      { icon: '🔗', title: 'CRM Sync', description: 'Every lead, conversation and viewing logged in your CRM automatically. Zero manual data entry.' },
      { icon: '💰', title: 'ROI Calculator', description: 'Calculates rental yield and investment returns for buyers automatically during the conversation. Converts investors faster.' },
    ],
    howItWorks: [
      { step: '1', title: 'Lead contacts you on WhatsApp', description: 'WhatsApp Sales Agent responds instantly, qualifies the lead and captures key requirements.' },
      { step: '2', title: 'Property matched automatically', description: 'Real Estate Agent matches the lead to your inventory and sends property options, pricing and photos.' },
      { step: '3', title: 'Viewing scheduled', description: 'Agent books a viewing directly in the chat. Calendar invite sent to both the lead and your broker.' },
      { step: '4', title: 'Follow-up and close', description: 'Automated follow-ups keep the lead warm. ROI calculations and comparisons sent to accelerate the decision.' },
    ],
    faq: [
      { question: 'Can I enable only some components?', answer: 'Yes. Each component can be enabled or disabled independently. You always have full control over which automations are active.' },
      { question: 'Does it replace my sales team?', answer: 'No. It handles the repetitive qualification and follow-up work so your agents focus on closing deals, not chasing cold leads.' },
    ],
    demoVideoUrl: '',
  },

  // ── CHATBOT TEMPLATES ────────────────────────────────────────────────────
  // moduleType: 'chatbot' — these back the /chatbots/[slug] detail pages.
  // `pricing` is deliberately left at its schema default ({monthly:0, annual:0,
  // features:[]}) and unused for this moduleType: chatbot pricing is global
  // across all templates and comes from GET /chatbot-plans (Basic/Pro/Enterprise),
  // not from a per-module pricing sub-doc like agents/automations use.

  {
    name: 'Restaurant Menu Bot',
    slug: 'restaurant-chatbot',
    description: 'Answers menu questions, takes reservations, and shares daily specials — day or night, in Arabic or English.',
    tagline: 'Never miss a booking or a menu question again',
    moduleType: 'chatbot', category: 'custom', pipelineType: 'hospitality', outputType: 'text',
    icon: '🍽️', color: '#f59e0b', badge: 'Live', sortOrder: 1,
    isActive: true, isComingSoon: false,
    nicheSlug: 'hospitality', pipelineCategory: 'standalone', availableIn: ['UAE', 'Kenya'],
    requiredApiKeys: ['openai'],
    platforms: ['website', 'whatsapp', 'instagram'],
    capabilities: ['Menu Q&A', 'Table reservations', 'Daily specials', 'Allergen info', 'WhatsApp ordering'],
    heroStats: [{ label: 'Response time', value: 'Instant' }, { label: 'Availability', value: '24/7' }, { label: 'Languages', value: 'AR + EN' }, { label: 'Setup time', value: '< 1 day' }],
    features: [
      { icon: '📋', title: 'Menu & allergen Q&A', description: 'Answers questions about dishes, ingredients and allergens straight from your uploaded menu — no more repeating the same answers to every customer.' },
      { icon: '📅', title: 'Table reservations', description: 'Takes booking requests directly in the chat and confirms availability, so your host staff isn’t stuck answering the phone during rush hour.' },
      { icon: '🔥', title: 'Daily specials', description: 'Shares today’s specials and promotions automatically — update once in the dashboard, it goes out everywhere your bot is deployed.' },
      { icon: '💬', title: 'WhatsApp ordering', description: 'Customers can ask about the menu and place delivery/pickup requests over WhatsApp, the channel they already use.' },
    ],
    faq: [
      { question: 'Can it take real orders, not just answer questions?', answer: 'The knowledge-base + Q&A flow is live today. Order-taking with kitchen webhook integration is on our roadmap — ask us about early access.' },
      { question: 'Does it know today’s specials automatically?', answer: 'You update specials in your dashboard knowledge base and the bot reflects it immediately across every channel.' },
    ],
    demoVideoUrl: 'https://1ajwuueru6fqolyr.public.blob.vercel-storage.com/chatbot-demos/restaurant-bot-demo-final.mp4',
  },
  {
    name: 'Real Estate Lead Bot',
    slug: 'real-estate-chatbot',
    description: 'Qualifies buyers and renters, schedules viewings, and sends listings — capturing leads while your agents are with clients.',
    tagline: 'Turn website visitors into qualified viewings',
    moduleType: 'chatbot', category: 'realestate', pipelineType: 'realestate', outputType: 'text',
    icon: '🏠', color: '#7c3aed', badge: 'Live', sortOrder: 2,
    isActive: true, isComingSoon: false,
    nicheSlug: 'real_estate', pipelineCategory: 'standalone', availableIn: ['UAE', 'Kenya'],
    requiredApiKeys: ['openai'],
    platforms: ['website', 'whatsapp', 'instagram'],
    capabilities: ['Buyer/renter qualification', 'Listing search', 'Viewing scheduling', 'Lead capture'],
    heroStats: [{ label: 'Lead response', value: 'Instant' }, { label: 'Availability', value: '24/7' }, { label: 'Languages', value: 'AR + EN' }, { label: 'Conversion boost', value: '+40%' }],
    features: [
      { icon: '🎯', title: 'Buyer & renter qualification', description: 'Asks the right questions — budget, timeline, property type — before a lead ever reaches your agents.' },
      { icon: '🏘️', title: 'Listing search', description: 'Shares relevant listings straight from your knowledge base based on what the customer is looking for.' },
      { icon: '📅', title: 'Viewing scheduling', description: 'Books viewing requests directly in the chat so agents follow up with a warm, scheduled lead instead of a cold enquiry.' },
      { icon: '📱', title: 'Instagram & WhatsApp capture', description: 'Catches leads from DMs and WhatsApp enquiries around the clock, not just during office hours.' },
    ],
    faq: [
      { question: 'Can it sync leads to my CRM?', answer: 'Not yet — today it captures and stores every conversation in your dashboard. CRM sync is on our roadmap.' },
      { question: 'Does it replace my sales agents?', answer: 'No — it handles the repetitive qualification work so your agents spend their time closing, not chasing unqualified leads.' },
    ],
    demoVideoUrl: 'https://1ajwuueru6fqolyr.public.blob.vercel-storage.com/chatbot-demos/real-estate-bot-demo.mp4',
  },
  {
    name: 'Clinic Appointment Bot',
    slug: 'clinic-chatbot',
    description: 'Books appointments, sends reminders, and handles clinic FAQs — reducing no-shows and front-desk phone volume.',
    tagline: 'Fewer no-shows, less phone tag',
    moduleType: 'chatbot', category: 'custom', pipelineType: 'healthcare', outputType: 'text',
    icon: '💆', color: '#22c55e', badge: 'Live', sortOrder: 3,
    isActive: true, isComingSoon: false,
    nicheSlug: 'healthcare', pipelineCategory: 'standalone', availableIn: ['UAE', 'Kenya'],
    requiredApiKeys: ['openai'],
    platforms: ['website', 'whatsapp', 'instagram'],
    capabilities: ['Appointment booking', 'Clinic FAQs', 'Service pricing', 'Reminder-ready'],
    heroStats: [{ label: 'Availability', value: '24/7' }, { label: 'Languages', value: 'AR + EN' }, { label: 'Setup time', value: '< 1 day' }, { label: 'No-show reduction', value: 'Fewer calls missed' }],
    features: [
      { icon: '📅', title: 'Appointment booking', description: 'Handles booking requests directly in the chat, in Arabic or English, without tying up your front desk.' },
      { icon: '❓', title: 'Clinic FAQs', description: 'Answers common questions about services, pricing and preparation instructions straight from your knowledge base.' },
      { icon: '🩺', title: 'Service & pricing info', description: 'Shares up-to-date service and pricing information so patients don’t have to call and wait on hold.' },
      { icon: '🤝', title: 'Human handoff', description: 'Escalates sensitive or complex questions to a human staff member automatically instead of guessing.' },
    ],
    faq: [
      { question: 'Can it handle medical advice questions?', answer: 'No — the bot is constrained to only answer from your knowledge base (services, hours, policies) and hands off anything else to your staff. It never gives medical advice.' },
      { question: 'Does it send appointment reminders automatically?', answer: 'Proactive reminder messaging is on our roadmap. Today it handles booking requests and FAQs in the conversation itself.' },
    ],
    demoVideoUrl: 'https://1ajwuueru6fqolyr.public.blob.vercel-storage.com/chatbot-demos/clinic-appointment-bot-demo.mp4',
  },
  {
    name: 'E-commerce Support Bot',
    slug: 'ecommerce-chatbot',
    description: 'Tracks orders, handles returns, and answers product questions instantly — cutting support tickets and response time.',
    tagline: 'Instant answers, fewer support tickets',
    moduleType: 'chatbot', category: 'ecommerce', pipelineType: 'ecommerce', outputType: 'text',
    icon: '🛍️', color: '#3b82f6', badge: 'Live', sortOrder: 4,
    isActive: true, isComingSoon: false,
    nicheSlug: 'ecommerce_retail', pipelineCategory: 'standalone', availableIn: ['UAE', 'Kenya'],
    requiredApiKeys: ['openai'],
    platforms: ['website', 'whatsapp', 'instagram'],
    capabilities: ['Order tracking Q&A', 'Return policy', 'Product Q&A', 'WhatsApp support'],
    heroStats: [{ label: 'Availability', value: '24/7' }, { label: 'Languages', value: 'AR + EN' }, { label: 'Response time', value: 'Instant' }, { label: 'Setup time', value: '< 1 day' }],
    features: [
      { icon: '📦', title: 'Order status Q&A', description: 'Answers "where’s my order" style questions instantly from your policies and info, cutting the most common support ticket type.' },
      { icon: '↩️', title: 'Returns & refunds', description: 'Walks customers through your return policy and process without a human needing to type the same answer for the hundredth time.' },
      { icon: '🛒', title: 'Product Q&A', description: 'Answers sizing, materials and availability questions straight from your product knowledge base — before checkout, not after.' },
      { icon: '💬', title: 'WhatsApp support', description: 'Handles support conversations on WhatsApp, where a growing share of your customers already expect to reach you.' },
    ],
    faq: [
      { question: 'Can it check live order status from Shopify/my store?', answer: 'Live order-lookup integration is on our roadmap. Today it answers from your policies and FAQ knowledge base.' },
      { question: 'Will it try to answer things outside my knowledge base?', answer: 'No — it’s constrained to only answer from what you’ve added. Anything else gets your fallback message instead of a made-up answer.' },
    ],
    demoVideoUrl: 'https://1ajwuueru6fqolyr.public.blob.vercel-storage.com/chatbot-demos/ecommerce-bot-demo.mp4',
  },
  {
    name: 'Gym Membership Bot',
    slug: 'gym-chatbot',
    description: 'Explains membership plans, books free trials, and handles schedule queries — converting website visitors into trial sign-ups.',
    tagline: 'Turn visitors into trial members, automatically',
    moduleType: 'chatbot', category: 'custom', pipelineType: 'custom', outputType: 'text',
    icon: '🏋️', color: '#ef4444', badge: 'Live', sortOrder: 5,
    isActive: true, isComingSoon: false,
    nicheSlug: 'hospitality', pipelineCategory: 'standalone', availableIn: ['UAE', 'Kenya'],
    requiredApiKeys: ['openai'],
    platforms: ['website', 'whatsapp', 'instagram'],
    capabilities: ['Membership plan Q&A', 'Free trial booking', 'Class schedule Q&A', 'WhatsApp enquiries'],
    heroStats: [{ label: 'Availability', value: '24/7' }, { label: 'Languages', value: 'AR + EN' }, { label: 'Response time', value: 'Instant' }, { label: 'Setup time', value: '< 1 day' }],
    features: [
      { icon: '💳', title: 'Membership plan Q&A', description: 'Explains pricing tiers and what’s included in each membership straight from your knowledge base.' },
      { icon: '🎟️', title: 'Free trial booking', description: 'Books free trial sessions directly in the conversation, capturing interested visitors before they leave your site.' },
      { icon: '🗓️', title: 'Class schedule queries', description: 'Answers questions about class times and availability without staff needing to check a spreadsheet.' },
      { icon: '💬', title: 'WhatsApp enquiries', description: 'Handles membership questions over WhatsApp, where most gym enquiries already happen.' },
    ],
    faq: [
      { question: 'Can it book a specific class time slot?', answer: 'It captures the request and preferred time in the conversation today; live calendar-slot booking is on our roadmap.' },
      { question: 'Does it work for a multi-location gym chain?', answer: 'Yes — you can run a separate bot per location, each with its own knowledge base and schedule info, from one dashboard.' },
    ],
    demoVideoUrl: 'https://1ajwuueru6fqolyr.public.blob.vercel-storage.com/chatbot-demos/gym-membership-bot-demo.mp4',
  },
  {
    name: 'Education Enrolment Bot',
    slug: 'education-chatbot',
    description: 'Guides prospective students, answers course FAQs, and collects applications — reducing admissions team workload.',
    tagline: 'Answer every prospective student, instantly',
    moduleType: 'chatbot', category: 'education', pipelineType: 'education', outputType: 'text',
    icon: '🎓', color: '#8b5cf6', badge: 'Live', sortOrder: 6,
    isActive: true, isComingSoon: false,
    nicheSlug: 'education', pipelineCategory: 'standalone', availableIn: ['UAE', 'Kenya'],
    requiredApiKeys: ['openai'],
    platforms: ['website', 'whatsapp', 'instagram'],
    capabilities: ['Course Q&A', 'Admissions FAQs', 'Application guidance', 'WhatsApp enquiries'],
    heroStats: [{ label: 'Availability', value: '24/7' }, { label: 'Languages', value: 'AR + EN' }, { label: 'Response time', value: 'Instant' }, { label: 'Setup time', value: '< 1 day' }],
    features: [
      { icon: '📚', title: 'Course Q&A', description: 'Answers questions about courses, duration and requirements straight from your knowledge base, day or night.' },
      { icon: '📝', title: 'Admissions FAQs', description: 'Handles the repetitive admissions questions your team answers dozens of times a week.' },
      { icon: '✅', title: 'Application guidance', description: 'Walks prospective students through what’s needed to apply, collecting interest before they lose momentum.' },
      { icon: '💬', title: 'WhatsApp enquiries', description: 'Reaches prospective students on the channel they already use to ask questions.' },
    ],
    faq: [
      { question: 'Can it submit applications directly into our system?', answer: 'Not yet — it collects and stores the enquiry in your dashboard today. Direct application-system integration is on our roadmap.' },
      { question: 'Can different courses have different FAQs?', answer: 'Yes — add as much course-specific content to the knowledge base as you need; the bot ranks and answers from the most relevant entries.' },
    ],
    demoVideoUrl: 'https://1ajwuueru6fqolyr.public.blob.vercel-storage.com/chatbot-demos/education-enrolment-bot-demo.mp4',
  },
];

@Injectable()
export class ModulesService implements OnModuleInit {
  private readonly logger = new Logger(ModulesService.name);

  constructor(
    @InjectModel(ModuleTemplate.name)
    private moduleModel: Model<ModuleDocument>,
  ) {}

  async onModuleInit() {
    await this.seedModules();
  }

  private async seedModules() {
    let seeded = 0;
    for (const m of SEED_MODULES) {
      const result = await this.moduleModel.updateOne(
        { slug: m.slug },
        { $setOnInsert: m },
        { upsert: true },
      );
      if (result.upsertedCount) seeded++;
    }
    this.logger.log(`Modules seeded: ${seeded} new / ${SEED_MODULES.length} total`);
  }

  // ── Public — list all active modules ─────────────────────

  async findAll(options: {
    moduleType?: string;
    category?: string;
    isActive?: boolean;
    search?: string;
    page?: number;
    limit?: number;
    includeDeleted?: boolean;
    country?: string;
    nicheSlug?: string;
    pipelineCategory?: string;
    lang?: string;
  } = {}) {
    const {
      moduleType, category, isActive, search,
      page = 1, limit = 20, includeDeleted = false,
      country, nicheSlug, pipelineCategory, lang = 'en',
    } = options;
    const skip = (page - 1) * limit;

    const filter: any = {};
    if (!includeDeleted) filter.isDeleted = false;
    if (moduleType) filter.moduleType = moduleType;
    if (category) filter.category = category;
    if (isActive !== undefined) filter.isActive = isActive;
    if (country) filter.availableIn = country;
    if (nicheSlug) filter.nicheSlug = nicheSlug;
    if (pipelineCategory) filter.pipelineCategory = pipelineCategory;
    if (search) filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
      { tagline: { $regex: search, $options: 'i' } },
    ];

    const [data, total] = await Promise.all([
      this.moduleModel.find(filter).sort({ sortOrder: 1, createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.moduleModel.countDocuments(filter),
    ]);

    const localized = lang === 'ar' ? data.map(d => this.localizeModule(d)) : data;
    return { data: localized, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getPublicStats() {
    const modules = await this.moduleModel.aggregate([
        { $match: { isDeleted: false, isActive: true } },
        {
          $group: {
            _id: null,
            totalModules: { $sum: 1 },
            totalUsersCount: { $sum: '$totalUsersCount' },
            totalRunsCount: { $sum: '$totalRunsCount' },
          }
        }
    ]);
 
    const stats = modules[0] || { totalModules: 0, totalUsersCount: 0, totalRunsCount: 0 };
 
    return {
      totalModules: stats.totalModules,
      totalUsers: stats.totalUsersCount,
      totalRuns: stats.totalRunsCount,
      // Hardcoded until we have real data
      hoursaved: Math.floor(stats.totalRunsCount * 4.5), // ~4.5 hours saved per run
      successRate: 98.2,
    };
  }

  // ── Get single module ─────────────────────────────────────

  async findOne(idOrSlug: string): Promise<ModuleDocument> {
    const filter = idOrSlug.match(/^[0-9a-fA-F]{24}$/)
      ? { _id: idOrSlug }
      : { slug: idOrSlug };

    const module = await this.moduleModel.findOne({ ...filter, isDeleted: false }).lean();
    if (!module) throw new NotFoundException('Module not found');
    return module as any;
  }

  // ── Admin CRUD ────────────────────────────────────────────

  async create(data: Partial<ModuleTemplate>): Promise<ModuleDocument> {
    if (data.slug) {
      const existing = await this.moduleModel.findOne({ slug: data.slug });
      if (existing) throw new BadRequestException(`Slug "${data.slug}" already exists`);
    }
    return this.moduleModel.create(data);
  }

  async update(idOrSlug: string, data: Partial<ModuleTemplate>): Promise<ModuleDocument> {
    const filter = idOrSlug.match(/^[0-9a-fA-F]{24}$/)
      ? { _id: idOrSlug }
      : { slug: idOrSlug };

    const module = await this.moduleModel.findOneAndUpdate(
      { ...filter, isDeleted: false },
      data,
      { new: true }
    );
    if (!module) throw new NotFoundException('Module not found');
    return module;
  }

  async softDelete(idOrSlug: string): Promise<void> {
    const filter = idOrSlug.match(/^[0-9a-fA-F]{24}$/)
      ? { _id: idOrSlug }
      : { slug: idOrSlug };

    await this.moduleModel.findOneAndUpdate(filter, { isDeleted: true, isActive: false });
  }

  // ── Stats update (called by pipeline) ────────────────────

  async incrementStats(moduleId: string, cost: number): Promise<void> {
    await this.moduleModel.findByIdAndUpdate(moduleId, {
      $inc: { totalRunsCount: 1, totalUsersCount: 0 },
      $set: { avgCostPerRun: cost },
    });
  }

  async incrementUserCount(moduleId: string): Promise<void> {
    await this.moduleModel.findByIdAndUpdate(moduleId, {
      $inc: { totalUsersCount: 1 },
    });
  }

  private localizeModule(doc: any): any {
    return {
      ...doc,
      name: doc.name_ar || doc.name,
      tagline: doc.tagline_ar || doc.tagline,
      description: doc.description_ar || doc.description,
      capabilities: doc.capabilities_ar?.length ? doc.capabilities_ar : doc.capabilities,
      'pricing.features': doc.pricing?.features_ar?.length ? doc.pricing.features_ar : doc.pricing?.features,
    };
  }
}