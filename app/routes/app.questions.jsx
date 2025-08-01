import { json, redirect } from "@remix-run/node";
import { useLoaderData, useActionData, Form } from "@remix-run/react";
import { useState, useEffect } from "react";
import {
  Page,
  Layout,
  Card,
  Button,
  TextField,
  Select,
  Banner,
  Modal,
  FormLayout,
  Badge,
  DataTable,
  ButtonGroup,
  Toast,
  Frame,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  
  // Get or create store questions
  let storeQuestions = await prisma.storeQuestions.findUnique({
    where: { shop: session.shop },
  });

  if (!storeQuestions) {
    // Create new store questions record if it doesn't exist
    storeQuestions = await prisma.storeQuestions.create({
      data: {
        shop: session.shop,
        questions: JSON.stringify([]),
        count: 1, // Default to showing 1 question at a time
      },
    });
  }

  const questions = JSON.parse(storeQuestions.questions || "[]");

  return json({ questions, count: storeQuestions.count || 1 });
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action");

  // Get current questions
  let storeQuestions = await prisma.storeQuestions.findUnique({
    where: { shop: session.shop },
  });

  if (!storeQuestions) {
    storeQuestions = await prisma.storeQuestions.create({
      data: {
        shop: session.shop,
        questions: JSON.stringify([]),
        count: 1, // Default to showing 1 question at a time
      },
    });
  }

  let questions = JSON.parse(storeQuestions.questions || "[]");

  if (action === "updateCount") {
    const count = parseInt(formData.get("count"));
    
    if (!count || isNaN(count) || count < 1) {
      return json({ error: "Count must be at least 1" }, { status: 400 });
    }

    await prisma.storeQuestions.update({
      where: { shop: session.shop },
      data: { count: count },
    });

    return json({ success: true, message: "Count updated successfully!" });
  }

  if (action === "create") {
    const title = formData.get("title");
    const question = formData.get("question");
    const dataType = formData.get("dataType");
    const options = formData.get("options");
    const formType = formData.get("formType");

    if (!title || !question || !dataType) {
      return json({ error: "All fields are required", formType: formType || "add" }, { status: 400 });
    }

    // Check if options are required for select types
    if ((dataType === "select" || dataType === "multiselect") && !options) {
      return json({ error: "Options are required for select questions", formType: formType || "add" }, { status: 400 });
    }

    const sanitizedTitle = title.toString().replace(/\s+/g, "").toLowerCase();

    // Check for duplicate titles
    const existingQuestion = questions.find(q => q.title === sanitizedTitle);
    if (existingQuestion) {
      return json({ error: "A question with this title already exists", formType: formType || "add" }, { status: 400 });
    }

    const newQuestion = {
      id: `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: sanitizedTitle,
      question: question.toString(),
      dataType: dataType.toString(),
      options: (dataType === "select" || dataType === "multiselect") ? options.toString() : null,
      createdAt: new Date().toISOString(),
      isActive: true,
    };

    questions.push(newQuestion);

    await prisma.storeQuestions.update({
      where: { shop: session.shop },
      data: { questions: JSON.stringify(questions) },
    });

    return redirect("/app/questions");
  }

  if (action === "update") {
    const id = formData.get("id");
    const title = formData.get("title");
    const question = formData.get("question");
    const dataType = formData.get("dataType");
    const options = formData.get("options");

    if (!id || !title || !question || !dataType) {
      return json({ error: "All fields are required" }, { status: 400 });
    }

    // Check if options are required for select types
    if ((dataType === "select" || dataType === "multiselect") && !options) {
      return json({ error: "Options are required for select questions" }, { status: 400 });
    }

    const sanitizedTitle = title.toString().replace(/\s+/g, "").toLowerCase();

    // Check for duplicate titles (excluding the current question being updated)
    const existingQuestion = questions.find(q => q.title === sanitizedTitle && q.id !== id);
    if (existingQuestion) {
      return json({ error: "A question with this title already exists" }, { status: 400 });
    }

    questions = questions.map(q => 
      q.id === id 
        ? { 
            ...q, 
            title: sanitizedTitle, 
            question: question.toString(), 
            dataType: dataType.toString(),
            options: (dataType === "select" || dataType === "multiselect") ? options.toString() : null
          }
        : q
    );

    await prisma.storeQuestions.update({
      where: { shop: session.shop },
      data: { questions: JSON.stringify(questions) },
    });

    return redirect("/app/questions");
  }

  if (action === "delete") {
    const id = formData.get("id");
    
    // Find the question being deleted to get its sanitized title
    const questionToDelete = questions.find(q => q.id === id);
    if (!questionToDelete) {
      return json({ error: "Question not found" }, { status: 404 });
    }

    // Remove question from the list
    questions = questions.filter(q => q.id !== id);

    await prisma.storeQuestions.update({
      where: { shop: session.shop },
      data: { questions: JSON.stringify(questions) },
    });

    // Also delete the metafield definition and all associated customer data for this question
    try {
      const shopifyApiUrl = `https://${session.shop}/admin/api/2024-01/graphql.json`;
      
      // First, get the metafield definition ID
      const getDefinitionQuery = `
        query getMetafieldDefinitions($ownerType: MetafieldOwnerType!) {
          metafieldDefinitions(first: 250, ownerType: $ownerType) {
            edges {
              node {
                id
                key
                namespace
              }
            }
          }
        }
      `;

      const definitionResponse = await fetch(shopifyApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': session.accessToken
        },
        body: JSON.stringify({
          query: getDefinitionQuery,
          variables: {
            ownerType: "CUSTOMER"
          }
        })
      });

      const definitionResult = await definitionResponse.json();
      
      if (definitionResult.data?.metafieldDefinitions?.edges) {
        // Find the definition for this question's sanitized title
        const sanitizedTitle = questionToDelete.title.toString().replace(/\s+/g, "").toLowerCase();
        const definitionToDelete = definitionResult.data.metafieldDefinitions.edges.find(
          edge => edge.node.key === sanitizedTitle && edge.node.namespace === "custom"
        );

        if (definitionToDelete) {
          // Delete the metafield definition and all associated customer data
          const deleteDefinitionMutation = `
            mutation metafieldDefinitionDelete($id: ID!, $deleteAllAssociatedMetafields: Boolean!) {
              metafieldDefinitionDelete(id: $id, deleteAllAssociatedMetafields: $deleteAllAssociatedMetafields) {
                deletedDefinitionId
                userErrors {
                  field
                  message
                  code
                }
              }
            }
          `;

          const deleteResponse = await fetch(shopifyApiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': session.accessToken
            },
            body: JSON.stringify({
              query: deleteDefinitionMutation,
              variables: {
                id: definitionToDelete.node.id,
                deleteAllAssociatedMetafields: true
              }
            })
          });

          const deleteResult = await deleteResponse.json();
          
          if (deleteResult.data?.metafieldDefinitionDelete?.userErrors?.length > 0) {
            console.error("⚠️ Errors deleting metafield definition:", deleteResult.data.metafieldDefinitionDelete.userErrors);
          } else {
            console.log(`✅ Deleted metafield definition and all customer data for question: ${sanitizedTitle}`);
          }
        }
      }
    } catch (error) {
      console.error("⚠️ Failed to delete metafield definition and customer data:", error);
      // Don't fail the whole operation if metafield deletion fails
    }

    return redirect("/app/questions");
  }

  if (action === "toggle") {
    const id = formData.get("id");
    
    questions = questions.map(q => 
      q.id === id ? { ...q, isActive: !q.isActive } : q
    );

    await prisma.storeQuestions.update({
      where: { shop: session.shop },
      data: { questions: JSON.stringify(questions) },
    });

    return redirect("/app/questions");
  }

  return json({ error: "Invalid action" }, { status: 400 });
};

export default function QuestionsPage() {
  const { questions, count } = useLoaderData();
  const actionData = useActionData();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [newTitle, setNewTitle] = useState("");
  const [newQuestion, setNewQuestion] = useState("");
  const [newDataType, setNewDataType] = useState("");
  const [newOptions, setNewOptions] = useState("");
  const [addTried, setAddTried] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingQuestionId, setDeletingQuestionId] = useState(null);
  const [displayCount, setDisplayCount] = useState(count || 1);
  const [showToast, setShowToast] = useState(false);

  // Show toast when count update is successful
  useEffect(() => {
    if (actionData?.success && actionData?.message) {
      setShowToast(true);
    }
  }, [actionData]);

  // When the Add modal is opened, reset addTried and fields
  const openAddModal = () => {
    setShowAddModal(true);
    setAddTried(false);
    setNewTitle("");
    setNewQuestion("");
    setNewDataType("");
    setNewOptions("");
    setIsSubmitting(false);
  };

  useEffect(() => {
    // Close add modal only on successful submission (no error and redirect happened)
    if (showAddModal && addTried && actionData && !actionData.error) {
      setShowAddModal(false);
      setAddTried(false);
      setNewTitle("");
      setNewQuestion("");
      setNewDataType("");
      setNewOptions("");
    }
  }, [actionData, showAddModal, addTried]);

  useEffect(() => {
    // Reset isSubmitting when questions data changes (indicates successful operation)
    setIsSubmitting(false);
    // Also close edit modal if it's open (successful update)
    if (editingQuestion) {
      setEditingQuestion(null);
    }
  }, [questions]);

  useEffect(() => {
    // Reset delete loading state after action completes
    if (deletingQuestionId && actionData) {
      setDeletingQuestionId(null);
    }
  }, [actionData, deletingQuestionId]);

  useEffect(() => {
    // Update displayCount when count from server changes
    setDisplayCount(count || 1);
  }, [count]);

  const dataTypeOptions = [
    { label: "Select a datatype", value: "" },
    { label: "Text", value: "text" },
    { label: "Number", value: "number" },
    { label: "Email", value: "email" },
    { label: "Select (Single)", value: "select" },
    { label: "Select (Multiple)", value: "multiselect" },
    { label: "Date", value: "date" },
    { label: "Textarea", value: "textarea" },
  ];

  const rows = questions.map((q) => [
    <span style={{ fontWeight: 'bold' }}>{q.title}</span>,
    <span title={q.question}>
      {q.question.length > 40 ? `${q.question.substring(0, 40)}...` : q.question}
    </span>,
    <Badge status={q.dataType === "text" ? "info" : "success"}>{q.dataType}</Badge>,
    <Badge status={q.isActive ? "success" : "attention"}>
      {q.isActive ? "Active" : "Inactive"}
    </Badge>,
    <ButtonGroup>
      <Button
        size="slim"
        onClick={() => {
          setEditingQuestion(q);
          setIsSubmitting(false); // Reset loading state when opening edit modal
        }}
      >
        Edit
      </Button>
      <Form method="post" style={{ display: 'inline' }}>
        <input type="hidden" name="action" value="toggle" />
        <input type="hidden" name="id" value={q.id} />
        <button type="submit" style={{ background: 'none', border: 'none', padding: 0 }}>
          <Button
            size="slim"
            tone={q.isActive ? "critical" : "success"}
          >
            {q.isActive ? "Deactivate" : "Activate"}
          </Button>
        </button>
      </Form>
      <Form method="post" style={{ display: 'inline' }}>
        <input type="hidden" name="action" value="delete" />
        <input type="hidden" name="id" value={q.id} />
        <button 
          type="submit" 
          style={{ background: 'none', border: 'none', padding: 0 }}
          onClick={() => setDeletingQuestionId(q.id)}
        >
          <Button
            size="slim"
            tone="critical"
            destructive
            loading={deletingQuestionId === q.id}
            disabled={deletingQuestionId === q.id}
          >
            Delete
          </Button>
        </button>
      </Form>
    </ButtonGroup>,
  ]);

  const toastMarkup = showToast ? (
    <Toast content={actionData?.message || "Updated successfully!"} onDismiss={() => setShowToast(false)} />
  ) : null;

  return (
    <Frame>
      {toastMarkup}
      <Page
        title="Question Management"
        subtitle="Manage questions for your thank you page"
        primaryAction={{
          content: "Add Question",
          onAction: openAddModal,
        }}
      >
      <Layout>
        <Layout.Section>
          <Card>
            <div style={{ marginBottom: '1rem' }}>
              <h3 style={{ marginBottom: '0.5rem', fontSize: '1.1rem', fontWeight: 'bold' }}>
                Display Settings
              </h3>
              <p style={{ marginBottom: '1rem', color: '#666', fontSize: '0.9rem' }}>
                Set how many questions to display at a time on the thank you page
              </p>
              <Form method="post" style={{ display: 'flex', alignItems: 'flex-end', gap: '1rem' }}>
                <input type="hidden" name="action" value="updateCount" />
                <div style={{ minWidth: '120px' }}>
                  <TextField
                    label="Questions per page"
                    name="count"
                    type="number"
                    value={displayCount === '' ? '' : displayCount.toString()}
                    onChange={(value) => {
                      if (value === '') {
                        setDisplayCount('');
                      } else {
                        const numValue = parseInt(value);
                        if (!isNaN(numValue) && numValue >= 1) {
                          setDisplayCount(numValue);
                        }
                      }
                    }}
                    min={1}
                  />
                </div>
                <Button submit variant="primary" size="slim">
                  Update
                </Button>
              </Form>
            </div>
          </Card>
        </Layout.Section>
        
        <Layout.Section>
          <Card>
            <DataTable
              columnContentTypes={[
                "text",
                "text",
                "text",
                "text",
                "text",
              ]}
              headings={[
                "Title",
                "Question",
                "Data Type",
                "Status",
                "Actions",
              ]}
              rows={rows}
            />
          </Card>
        </Layout.Section>
      </Layout>

      {/* Add Question Modal */}
      <Modal
        open={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setAddTried(false);
          setNewTitle("");
          setNewQuestion("");
          setNewDataType("");
          setNewOptions("");
          setIsSubmitting(false);
        }}
        title="Add New Question"
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => {
              setShowAddModal(false);
              setAddTried(false);
              setNewTitle("");
              setNewQuestion("");
              setNewDataType("");
              setNewOptions("");
              setIsSubmitting(false);
            },
          },
        ]}
      >
        <Modal.Section>
          <Form method="post" onSubmit={() => {
            setIsSubmitting(true);
            setAddTried(true);
            if(newTitle && newQuestion && newDataType && 
               (!(newDataType === "select" || newDataType === "multiselect") || newOptions)) {
              // Don't close modal immediately, let the server response handle it
              setTimeout(() => {
                setShowAddModal(false);
              }, 200);
            }
          }}
          >
            <input type="hidden" name="action" value="create" />
            <input type="hidden" name="formType" value="add" />
            <FormLayout>
              {addTried && actionData?.error && actionData?.formType === "add" && (
                <Banner status="critical">{actionData.error}</Banner>
              )}
              <TextField
                label="Question Title"
                name="title"
                value={newTitle}
                onChange={setNewTitle}
                placeholder="e.g., Customer Feedback"
                required
              />
              <TextField
                label="Question Text"
                name="question"
                value={newQuestion}
                onChange={setNewQuestion}
                placeholder="e.g., How would you rate your experience?"
                multiline={3}
                required
              />
              <Select
                label="Answer Data Type"
                name="dataType"
                options={dataTypeOptions}
                value={newDataType}
                onChange={setNewDataType}
                required
              />
              {(newDataType === "select" || newDataType === "multiselect") && (
                <TextField
                  label="Options (one per line)"
                  name="options"
                  value={newOptions}
                  onChange={setNewOptions}
                  placeholder="Option 1&#10;Option 2&#10;Option 3"
                  multiline={4}
                  helpText="Enter each option on a new line"
                  required
                />
              )}
              <Button primary submit loading={isSubmitting} disabled={isSubmitting}>
                Add Question
              </Button>

            </FormLayout>
          </Form>
        </Modal.Section>
      </Modal>

      {/* Edit Question Modal */}
      <Modal
        open={!!editingQuestion}
        onClose={() => setEditingQuestion(null)}
        title="Edit Question"
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setEditingQuestion(null),
          },
        ]}
      >
        <Modal.Section>
          <Form method="post" onSubmit={() => {
            setIsSubmitting(true);
            // Don't close modal immediately, let the server response handle it
            setTimeout(() => {
              setEditingQuestion(null);
            }, 200);
          }}>
            <input type="hidden" name="action" value="update" />
            <input type="hidden" name="id" value={editingQuestion?.id} />
            <FormLayout>
              {actionData?.error && (
                <Banner status="critical">{actionData.error}</Banner>
              )}
              <TextField
                label="Question Title"
                name="title"
                value={editingQuestion?.title || ""}
                onChange={(value) =>
                  setEditingQuestion({ ...editingQuestion, title: value })
                }
                required
              />
              <TextField
                label="Question Text"
                name="question"
                value={editingQuestion?.question || ""}
                onChange={(value) =>
                  setEditingQuestion({ ...editingQuestion, question: value })
                }
                multiline={3}
                required
              />
              <Select
                label="Answer Data Type"
                name="dataType"
                options={dataTypeOptions}
                value={editingQuestion?.dataType || ""}
                onChange={(value) =>
                  setEditingQuestion({ ...editingQuestion, dataType: value })
                }
                required
              />
              {(editingQuestion?.dataType === "select" || editingQuestion?.dataType === "multiselect") && (
                <TextField
                  label="Options (one per line)"
                  name="options"
                  value={editingQuestion?.options || ""}
                  onChange={(value) =>
                    setEditingQuestion({ ...editingQuestion, options: value })
                  }
                  placeholder="Option 1&#10;Option 2&#10;Option 3"
                  multiline={4}
                  helpText="Enter each option on a new line"
                  required
                />
              )}
              <Button submit primary loading={isSubmitting} disabled={isSubmitting}>
                Save Changes
              </Button>
            </FormLayout>
          </Form>
        </Modal.Section>
      </Modal>

    </Page>
    </Frame>
  );
}
