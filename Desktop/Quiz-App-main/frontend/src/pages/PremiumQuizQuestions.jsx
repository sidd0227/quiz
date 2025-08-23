import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "../utils/axios";
import "../App.css";
import "./QuizQuestions.css";
import NotificationModal from "../components/NotificationModal";
import { useNotification } from "../hooks/useNotification";

const PremiumQuizQuestions = () => {
    const { id } = useParams();  // Get quiz ID from URL
    const navigate = useNavigate();
    const [quiz, setQuiz] = useState(null);

    // Notification system
    const { notification, showSuccess, showError, hideNotification } = useNotification();

    // Fetch the quiz data with questions
    const getQuizDetails = async () => {
        try {
            const response = await axios.get(`/api/quizzes/${id}`);
            setQuiz(response.data);
        } catch (error) {
            console.error("Error fetching quiz details:", error);
            showError("Failed to fetch quiz details.");
        }
    };

    useEffect(() => {
        getQuizDetails();
    }, [id]);

    // ✅ Delete a question from the quiz
    const deleteQuestion = async (questionIndex) => {
        if (!window.confirm("Are you sure you want to delete this question?")) return;

        try {
            await axios.delete(`/api/quizzes/${id}/questions/${questionIndex}`);
            showSuccess("Question deleted successfully!");
            getQuizDetails();
        } catch (error) {
            console.error("Error deleting question:", error);
            showError("Failed to delete question.");
        }
    };

    return (
        <div className="quiz-questions-container">
            <button className="back-btn" onClick={() => navigate("/premium/quizzes")}>🔙 Back to Quizzes</button>

            {quiz ? (
                <div className="quiz-details">
                    <h2>📖 {quiz.title} - Questions</h2>
                    <p><strong>Category:</strong> {quiz.category}</p>
                    <p><strong>Duration:</strong> {quiz.duration} minutes</p>
                    <p><strong>Total Marks:</strong> {quiz.totalMarks}</p>
                    <p><strong>Passing Marks:</strong> {quiz.passingMarks}</p>

                    <div className="question-list">
                        {quiz.questions.length > 0 ? (
                            quiz.questions.map((q, index) => (
                                <div key={index} className="question-box">
                                    <h3>{index + 1}. {q.question}</h3>
                                    <ul>
                                        {q.options.map((option, i) => (
                                            <li key={i}><strong>{String.fromCharCode(65 + i)}.</strong> {option}</li>
                                        ))}
                                    </ul>
                                    <p><strong>Correct Answer:</strong> {q.correctAnswer}</p>
                                    <button className="delete-btn" onClick={() => deleteQuestion(index)}>🗑️ Delete Question</button>
                                </div>
                            ))
                        ) : (
                            <p>No questions added yet.</p>
                        )}
                    </div>
                </div>
            ) : (
                <p>Loading quiz details...</p>
            )}
            
            {/* Notification Modal */}
            <NotificationModal
                isOpen={notification.isOpen}
                message={notification.message}
                type={notification.type}
                onClose={hideNotification}
                autoClose={notification.autoClose}
            />
        </div>
    );
};

export default PremiumQuizQuestions;