import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  List,
  InlineStack,
  Link,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  return null;
};

export default function Index() {
  return (
    <Page>
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="500">
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Welcome to Thank You Page Survey! 🙏
                  </Text>
                  <Text variant="bodyMd" as="p">
                    Collect valuable customer feedback right after purchase with our seamless 
                    thank you page survey extension. Transform your post-purchase experience 
                    into a powerful data collection opportunity.
                  </Text>
                </BlockStack>
                
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">
                    What does this app do?
                  </Text>
                  <Text as="p" variant="bodyMd">
                    Our app automatically displays custom surveys on your store's thank you page 
                    after customers complete their purchase. The surveys are smart - they only show 
                    questions that customers haven't answered before, ensuring a smooth experience 
                    without repetitive questioning.
                  </Text>
                </BlockStack>

                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">
                    Key Features
                  </Text>
                  <List type="bullet">
                    <List.Item>
                      <strong>Multiple Question Types:</strong> Text, email, date, number, textarea, 
                      single-select, and multi-select options
                    </List.Item>
                    <List.Item>
                      <strong>Smart Question Management:</strong> Questions only appear for customers 
                      who haven't answered them yet
                    </List.Item>
                    <List.Item>
                      <strong>Instant Data Storage:</strong> Answers are automatically saved to 
                      customer metafields in your Shopify admin
                    </List.Item>
                    <List.Item>
                      <strong>Seamless Integration:</strong> Appears naturally on the thank you page 
                      without disrupting the checkout flow
                    </List.Item>
                    <List.Item>
                      <strong>Easy Management:</strong> Create, edit, activate, and deactivate 
                      questions from your admin panel
                    </List.Item>
                  </List>
                </BlockStack>

                <InlineStack gap="300">
                  <Link url="/app/questions">
                    <Button variant="primary">
                      Create Your Survey
                    </Button>
                  </Link>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
