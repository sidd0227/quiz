import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Quiz from "../models/Quiz.js";
import mongoose from "mongoose";

dotenv.config();

if (!process.env.GEMINI_API_KEY) {
    throw new Error("🚫 GEMINI_API_KEY is missing from .env file!");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const generateFromGemini = async (prompt) => {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

        const result = await model.generateContent({
            contents: [{ parts: [{ text: prompt }] }]
        });

        const raw = result.response.text();
        console.log("🔍 Gemini API Response:", raw);
        console.log("✅ Gemini API success");
        return raw;
    } catch (error) {
        console.error("❌ Gemini API error:", error);
        throw error;
    }
};

const parseAIResponse = (aiText) => {
    try {
        const cleanText = aiText.replace(/```(?:json)?\s*([\s\S]*?)\s*```/, '$1').trim();
        return JSON.parse(cleanText);
    } catch (e) {
        console.error("❌ JSON Parsing Error:", e, "\nOriginal AI Text:", aiText);
        throw new Error("AI returned invalid JSON: " + e.message);
    }
};

// ✅ General MCQ Generator
export const generateQuizQuestions = async (req, res) => {
    try {
        const { topic, numQuestions } = req.body;
        const { id } = req.params;

        if (!topic || !numQuestions) {
            return res.status(400).json({ error: "Topic and number of questions are required" });
        }

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: "Invalid quiz ID" });
        }

        const quiz = await Quiz.findById(id);
        if (!quiz) return res.status(404).json({ error: "Quiz not found" });

        const existingQuestions = new Set(quiz.questions.map(q => q.question.trim().toLowerCase()));
        const finalQuestions = [];

        let attempts = 0;
        const maxAttempts = 5;

        while (finalQuestions.length < numQuestions && attempts < maxAttempts) {
            const prompt = `
                You are an expert quiz designer. Your task is to generate ${numQuestions} high-quality multiple-choice questions about "${topic}".

                The response MUST be ONLY a single, valid JSON object. Do not include any text, explanations, or markdown formatting outside of the JSON object.
                
                The JSON object must have a single key "questions", which contains an array of question objects. Each question object must have the following exact structure and keys:
                - "question": A string containing the question text.
                - "options": An array of exactly 4 strings representing the possible answers.
                - "correctAnswer": A string with the letter corresponding to the correct option ("A", "B", "C", or "D"). The first option is "A", the second is "B", and so on.
                - "difficulty": A string that is one of "easy", "medium", or "hard".
                Here is an example of the required output format:
                Output format:
                {
                "questions": [
                    {
                    "question": "What is 2 + 2?",
                    "options": ["3", "4", "5", "6"],
                    "correctAnswer": "B",
                    "difficulty": "easy"
                    }
                ]
                }
                No explanation or extra output.
                `;

            const aiText = await generateFromGemini(prompt);
            let parsed;

            try {
                parsed = parseAIResponse(aiText);
            } catch (e) {
                return res.status(500).json({ error: "AI returned invalid JSON", details: e.message });
            }

            const newUnique = parsed.questions.filter(q => {
                const normalized = q.question.trim().toLowerCase();
                return !existingQuestions.has(normalized);
            });

            newUnique.forEach(q => {
                const normalized = q.question.trim().toLowerCase();
                if (!["easy", "medium", "hard"].includes(q.difficulty)) {
                    q.difficulty = "medium";
                }
                existingQuestions.add(normalized);
            });

            finalQuestions.push(...newUnique);
            attempts++;
        }

        if (finalQuestions.length === 0) {
            return res.status(400).json({ error: "No new unique questions could be generated" });
        }

        quiz.questions.push(...finalQuestions.slice(0, numQuestions));
        quiz.totalMarks = quiz.questions.length;
        quiz.passingMarks = Math.ceil(quiz.totalMarks / 2);
        quiz.duration = quiz.questions.length * 2;

        await quiz.save();
        res.json({
            message: `${finalQuestions.length} new questions added successfully`,
            questions: finalQuestions.slice(0, numQuestions)
        });
    } catch (err) {
        console.error("🔥 AI Question Error:", err);
        res.status(500).json({ error: "Internal server error", details: err.message });
    }
};

// ✅ Adaptive MCQ Generator
export const generateAdaptiveQuestions = async (req, res) => {
    try {
        const { performance, quizId, numQuestions = 5 } = req.body;

        const quiz = await Quiz.findById(quizId);
        if (!quiz) return res.status(404).json({ error: "Quiz not found" });

        const topic = quiz.category;
        const difficulty = performance === "low" ? "easy" : performance === "high" ? "hard" : "medium";

        const existingQuestions = new Set(quiz.questions.map(q => q.question.trim().toLowerCase()));
        const finalQuestions = [];

        let attempts = 0;
        const maxAttempts = 5;

        while (finalQuestions.length < numQuestions && attempts < maxAttempts) {
            const prompt = `
                You are an adaptive learning specialist. Your task is to generate exactly ${numQuestions} multiple-choice questions on the topic of "${topic}".
                All questions generated MUST have a difficulty level of "${difficulty}".
                
                The response MUST be ONLY a single, valid JSON object. Do not include any text, explanations, or markdown formatting outside of the JSON object.
                
                The JSON object must have a single key "questions", which contains an array of question objects. Each question object must have the following exact structure and keys:
                - "question": A string containing the question text.
                - "options": An array of exactly 4 strings representing the possible answers.
                - "correctAnswer": A string with the letter corresponding to the correct option ("A", "B", "C", or "D"). The first option is "A", the second is "B", and so on.
                - "difficulty": A string that must be exactly "${difficulty}".
                
                Here is an example of the required output format for a '${difficulty}' question:
                Output format:
                {
                "questions": [
                    {
                    "question": "What is 2 + 2?",
                    "options": ["3", "4", "5", "6"],
                    "correctAnswer": "B",
                    "difficulty": '${difficulty}'
                    }
                ]
                }
                No explanation or text outside JSON.
                `;

            const aiText = await generateFromGemini(prompt);
            let parsed;

            try {
                parsed = parseAIResponse(aiText);
            } catch (e) {
                return res.status(500).json({ error: "AI returned invalid JSON", details: e.message });
            }

            const newUnique = parsed.questions.filter(q => {
                const normalized = q.question.trim().toLowerCase();
                return !existingQuestions.has(normalized);
            });

            newUnique.forEach(q => {
                const normalized = q.question.trim().toLowerCase();
                existingQuestions.add(normalized);
            });

            finalQuestions.push(...newUnique);
            attempts++;
        }

        if (finalQuestions.length === 0) {
            return res.status(400).json({ error: "No new unique adaptive questions could be generated" });
        }

        quiz.questions.push(...finalQuestions.slice(0, numQuestions));
        quiz.totalMarks = quiz.questions.length;
        quiz.duration = quiz.questions.length * 2;
        quiz.passingMarks = Math.ceil(quiz.totalMarks / 2);

        await quiz.save();
        res.json({
            message: `${finalQuestions.length} adaptive questions added successfully`,
            questions: finalQuestions.slice(0, numQuestions)
        });
    } catch (err) {
        console.error("🔥 Adaptive AI Error:", err);
        res.status(500).json({ error: "Internal server error", details: err.message });
    }
};
