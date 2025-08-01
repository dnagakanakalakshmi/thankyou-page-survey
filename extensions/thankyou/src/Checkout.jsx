import {
  reactExtension,
  TextField,
  Button,
  BlockStack,
  InlineStack,
  Text,
  Select,
  useApi,
  Heading,
  Banner,
  View,
  Choice,
  ChoiceList
} from '@shopify/ui-extensions-react/checkout';
import React from 'react';

export default reactExtension(
  'purchase.thank-you.block.render',
  () => <Extension />
);

function Extension() {
  const [questions, setQuestions] = React.useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = React.useState(0);
  const [answers, setAnswers] = React.useState({});
  const [currentAnswer, setCurrentAnswer] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [showThankYou, setShowThankYou] = React.useState(false);
  const [error, setError] = React.useState("");

  const apiContext = useApi();
  const customerId = apiContext?.buyerIdentity?.customer?.current?.id;
  const shop = apiContext?.shop?.myshopifyDomain;

  // Load unanswered questions
  React.useEffect(() => {

    const loadQuestions = async () => {
      if (!customerId || !shop) return;

      try {
        const extractedCustomerId = customerId.replace('gid://shopify/Customer/', '');
        const apiUrl = `https://walnut-medications-party-fraction.trycloudflare.com/app/getquestions?customerId=${extractedCustomerId}&shop=${shop}`;
        
        const response = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        const result = await response.json();

        if (response.ok && result.questions) {
          setQuestions(result.questions);
          // Don't show thank you banner if there are no questions
          // Only show it when user completes answering questions
        } else {
          console.error("Error loading questions:", result.error);
          setError("Failed to load questions");
        }
      } catch (error) {
        console.error("Network error:", error);
        setError("Network error occurred");
      } finally {
        setLoading(false);
      }
    };

    loadQuestions();
  }, [customerId, shop]);

  // Save individual answer immediately
  const saveAnswer = async (questionTitle, answer) => {
    if (!customerId || !answer?.trim()) return;

    try {
      const extractedCustomerId = customerId.replace('gid://shopify/Customer/', '');
      const apiUrl = 'https://walnut-medications-party-fraction.trycloudflare.com/app/getquestions';
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerId: extractedCustomerId,
          answers: {
            [questionTitle]: answer
          },
          shop: shop
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to save answer');
      }
    } catch (error) {
      console.error("Error saving answer:", error);
      throw error;
    }
  };

  const handleNext = async () => {
    if (!currentAnswer.trim()) {
      setError("Please provide an answer before proceeding");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const currentQuestion = questions[currentQuestionIndex];
      await saveAnswer(currentQuestion.title, currentAnswer);
      
      // Update local answers state
      setAnswers(prev => ({
        ...prev,
        [currentQuestion.title]: currentAnswer
      }));

      // Move to next question or finish
      if (currentQuestionIndex < questions.length - 1) {
        setCurrentQuestionIndex(prev => prev + 1);
        setCurrentAnswer("");
      } else {
        setShowThankYou(true);
      }
    } catch (error) {
      setError("Failed to save answer. Please try again.");
    } finally {
      setSaving(false);
    }
  };



  const renderQuestionInput = (question) => {
    switch (question.dataType) {
      case 'date':
        return (
          <BlockStack spacing="tight">
            <Text>{question.question}</Text>
            <TextField
              label="Please enter your response"
              type="date"
              value={currentAnswer}
              onChange={setCurrentAnswer}
            />
          </BlockStack>
        );
      case 'email':
        return (
          <BlockStack spacing="tight">
            <Text>{question.question}</Text>
            <TextField
              label="Please enter your response"
              type="email"
              value={currentAnswer}
              onChange={setCurrentAnswer}
            />
          </BlockStack>
        );
      case 'number':
        return (
          <BlockStack spacing="tight">
            <Text>{question.question}</Text>
            <TextField
              label="Please enter your response"
              value={currentAnswer}
              onChange={setCurrentAnswer}
              autoComplete="off"
            />
          </BlockStack>
        );
      case 'textarea':
        return (
          <BlockStack spacing="tight">
            <Text>{question.question}</Text>
            <TextField
              label="Please enter your response"
              multiline={3}
              value={currentAnswer}
              onChange={setCurrentAnswer}
            />
          </BlockStack>
        );
      case 'select':
        if (question.options) {
          const options = question.options.split('\n').filter(opt => opt.trim());
          
          return (
            <BlockStack spacing="tight">
              <Text>{question.question}</Text>
              <ChoiceList
                name={`select-${question.id || currentQuestionIndex}`}
                variant="group"
                value={currentAnswer}
                onChange={setCurrentAnswer}
              >
                {options.map((option, index) => (
                  <Choice key={index} id={option.trim()}>
                    {option.trim()}
                  </Choice>
                ))}
              </ChoiceList>
            </BlockStack>
          );
        } else {
          // Fallback for old questions without options
          return (
            <BlockStack spacing="tight">
              <Text>{question.question}</Text>
              <TextField
                label="Please enter your response"
                value={currentAnswer}
                onChange={setCurrentAnswer}
              />
            </BlockStack>
          );
        }
      case 'multiselect':
        if (question.options) {
          const options = question.options.split('\n').filter(opt => opt.trim());
          const selectedValues = currentAnswer ? currentAnswer.split(',').map(s => s.trim()) : [];
          
          return (
            <BlockStack spacing="tight">
              <Text>{question.question}</Text>
              <ChoiceList
                name={`multiselect-${question.id || currentQuestionIndex}`}
                value={selectedValues}
                onChange={(values) => {
                  setCurrentAnswer(values.join(', '));
                }}
              >
                <BlockStack>
                  {options.map((option, index) => (
                    <Choice key={index} id={option.trim()}>
                      {option.trim()}
                    </Choice>
                  ))}
                </BlockStack>
              </ChoiceList>
            </BlockStack>
          );
        } else {
          // Fallback for old questions without options
          return (
            <BlockStack spacing="tight">
              <Text>{question.question}</Text>
              <TextField
                label="Please enter your response"
                value={currentAnswer}
                onChange={setCurrentAnswer}
              />
            </BlockStack>
          );
        }
      default: // text
        return (
          <BlockStack spacing="tight">
            <Text>{question.question}</Text>
            <TextField
              label="Please enter your response"
              value={currentAnswer}
              onChange={setCurrentAnswer}
            />
          </BlockStack>
        );
    }
  };

  if (showThankYou) {
    return (
      <BlockStack spacing="base">
        <Banner status="success">
          <Heading level={2}>Thank you!</Heading>
          <Text>We appreciate you taking the time to complete our survey.</Text>
        </Banner>
      </BlockStack>
    );
  }

  if (questions.length === 0) {
    return null; // No questions to show
  }

  const currentQuestion = questions[currentQuestionIndex];

  return (
    <BlockStack spacing="base">
      <Heading level={2}>Quick Survey</Heading>
      
      {/* Error message */}
      {error && (
        <Banner status="critical">
          <Text>{error}</Text>
        </Banner>
      )}

      {/* Current question */}
      <BlockStack spacing="tight">
        {renderQuestionInput(currentQuestion)}
      </BlockStack>

      {/* Action buttons */}
      <Button
        onPress={handleNext}
        kind="primary"
        loading={saving}
        disabled={saving}
      >
        Save
      </Button>
    </BlockStack>
  );
}


