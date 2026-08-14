'use client';

import { CheckOutlined, SaveOutlined, SettingOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, InputNumber, Skeleton, Space, Tag, Typography } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useCurrentAccess } from '@/components/v2/access-context';
import {
  errorText,
  pendingIdempotencyKey,
  requestV2,
  type PendingIdempotencyRequest,
} from '@/components/v2/api-client';
import { formatNumber } from '@/lib/formatters';

const { Text } = Typography;

type DraftComponent = {
  inventoryItemId: string;
  name?: string;
  itemName?: string;
  baseUnit?: string;
  unit?: string;
  inputQuantity?: number | string | null;
  expectedYieldPercent?: number | string | null;
};

type DraftRecipe = {
  id: string;
  version: number;
  versionNumber?: number;
  status: 'draft' | 'released' | string;
  shelfLifeHours?: number | null;
  components: DraftComponent[];
};

type RecipeDefinition = {
  id: string;
  version: number;
  code: string;
  name: string;
  sku?: { id: string; code: string; name: string } | null;
  versions: DraftRecipe[];
};

type RecipeResponse = { recipes: RecipeDefinition[] };
type RecipeMutationResponse = DraftRecipe | { recipe: DraftRecipe } | { recipeVersion: DraftRecipe };

function normalizeRecipe(value: RecipeMutationResponse) {
  if ('recipeVersion' in value) return value.recipeVersion;
  if ('recipe' in value) return value.recipe;
  return value;
}

function configured(version: DraftRecipe) {
  return (
    Number(version.shelfLifeHours ?? 0) > 0 &&
    version.components.length > 0 &&
    version.components.every(
      (component) =>
        Number(component.inputQuantity ?? 0) > 0 &&
        Number(component.expectedYieldPercent ?? 0) > 0,
    )
  );
}

type ComponentDraftValue = { inputQuantity: number; expectedYieldPercent: number };

export function RecipeConfigurationCard({ onReleased }: { onReleased: () => void }) {
  const { message } = App.useApp();
  const { can, loading: accessLoading } = useCurrentAccess();
  const [recipeDefinition, setRecipeDefinition] = useState<RecipeDefinition | null>(null);
  const [recipe, setRecipe] = useState<DraftRecipe | null>(null);
  const [componentValues, setComponentValues] = useState<Record<string, ComponentDraftValue>>({});
  const [shelfLifeHours, setShelfLifeHours] = useState<number>(24);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const configurationRequest = useRef<PendingIdempotencyRequest>(null);
  const releaseRequest = useRef<PendingIdempotencyRequest>(null);

  const allowed = can('catalog:write');

  useEffect(() => {
    if (accessLoading || !allowed) return;
    const controller = new AbortController();
    requestV2<RecipeResponse>('/api/v2/recipes?skuCode=HBF-BOX-001', {
      signal: controller.signal,
    })
      .then((value) => {
        const definition = value.recipes?.[0] ?? null;
        const alreadyReleased = definition?.versions.some(
          (version) => version.status === 'released',
        );
        const draft = alreadyReleased
          ? null
          : definition?.versions.find(
              (version) => version.status === 'draft' && configured(version),
            ) ??
            definition?.versions.find((version) => version.status === 'draft') ??
            null;
        setRecipeDefinition(definition);
        setRecipe(draft);
        if (draft) {
          setShelfLifeHours(Number(draft.shelfLifeHours ?? 24));
          setComponentValues(
            Object.fromEntries(
              draft.components.map((component) => [
                component.inventoryItemId,
                {
                  inputQuantity: Number(component.inputQuantity ?? 0),
                  expectedYieldPercent: Number(component.expectedYieldPercent ?? 100),
                },
              ]),
            ),
          );
          setDirty(!configured(draft));
        }
        setError(null);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === 'AbortError') return;
        setError(errorText(requestError, 'Không tải được bản nháp công thức Healthy.'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [accessLoading, allowed]);

  if (accessLoading || !allowed) return null;
  if (loading) {
    return <Card className='surface-card'><Skeleton active paragraph={{ rows: 4 }} /></Card>;
  }
  if (!recipe && !error) return null;

  const invalidComponents = recipe?.components.some((component) => {
    const value = componentValues[component.inventoryItemId];
    return (
      !value ||
      value.inputQuantity <= 0 ||
      value.expectedYieldPercent <= 0 ||
      value.expectedYieldPercent > 100
    );
  });

  async function saveRecipe() {
    if (!recipeDefinition || !recipe) {
      throw new Error('Không tìm thấy bản nháp công thức.');
    }
    if (configured(recipe) && !dirty) return recipe;
    const payloadWithoutKey = {
      baseVersionId: recipe.id,
      baseVersion: recipe.version,
      components: recipe.components.map((component) => ({
        inventoryItemId: component.inventoryItemId,
        inputQuantity: componentValues[component.inventoryItemId]?.inputQuantity ?? 0,
        expectedYieldPercent:
          componentValues[component.inventoryItemId]?.expectedYieldPercent ?? 0,
      })),
      shelfLifeHours,
    };
    const value = await requestV2<RecipeMutationResponse>(
      `/api/v2/recipes/${recipeDefinition.id}/versions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey: pendingIdempotencyKey(
            configurationRequest,
            'recipe-config-hbf',
            payloadWithoutKey,
          ),
          ...payloadWithoutKey,
        }),
      },
    );
    const saved = normalizeRecipe(value);
    setRecipe(saved);
    setDirty(false);
    configurationRequest.current = null;
    return saved;
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await saveRecipe();
      message.success('Đã tạo bản định mức công thức Healthy.');
    } catch (requestError) {
      const copy = errorText(requestError, 'Không thể lưu công thức. Dữ liệu nhập vẫn được giữ.');
      setError(copy);
      message.error(copy);
    } finally {
      setSaving(false);
    }
  }

  async function handleRelease() {
    setSaving(true);
    setError(null);
    try {
      const saved = await saveRecipe();
      const releasePayload = { version: saved.version };
      await requestV2<RecipeMutationResponse>(
        `/api/v2/recipe-versions/${saved.id}/release`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idempotencyKey: pendingIdempotencyKey(
              releaseRequest,
              'recipe-release-hbf',
              releasePayload,
            ),
            ...releasePayload,
          }),
        },
      );
      setRecipeDefinition(null);
      setRecipe(null);
      releaseRequest.current = null;
      message.success('Đã phát hành công thức Healthy; món đã sẵn sàng để làm mẻ.');
      onReleased();
    } catch (requestError) {
      const copy = errorText(
        requestError,
        'Không thể phát hành công thức. Các định mức đang nhập vẫn được giữ.',
      );
      setError(copy);
      message.error(copy);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card
      className='surface-card v2-recipe-config-card'
      title={
        <Space wrap>
          <SettingOutlined />
          <span>Hoàn thiện công thức Hộp ăn sáng Healthy</span>
          <Tag color='warning'>Chủ quán · bản nháp</Tag>
        </Space>
      }
    >
      <Alert
        type='info'
        showIcon
        title='Nhập lượng nguyên liệu thô cho một hộp, tỷ lệ thu hồi dự kiến và hạn dùng trước khi phát hành.'
      />
      {error ? <Alert type='error' showIcon title='Chưa thể cập nhật công thức' description={error} /> : null}
      <div className='v2-recipe-component-grid'>
        {recipe?.components.map((component) => {
          const value = componentValues[component.inventoryItemId] ?? {
            inputQuantity: 0,
            expectedYieldPercent: 100,
          };
          const unit = component.baseUnit ?? component.unit ?? '';
          return (
            <div className='v2-recipe-component' key={component.inventoryItemId}>
              <div>
                <Text strong>{component.name ?? component.itemName ?? 'Nguyên liệu'}</Text>
                <Text type='secondary'>Cho 1 hộp thành phẩm</Text>
              </div>
              <label className='v2-field'>
                <span>Lượng thô đầu vào</span>
                <InputNumber
                  min={0.001}
                  inputMode='decimal'
                  addonAfter={unit}
                  value={value.inputQuantity}
                  onChange={(inputQuantity) => {
                    setDirty(true);
                    setComponentValues((current) => ({
                      ...current,
                      [component.inventoryItemId]: {
                        ...value,
                        inputQuantity: Number(inputQuantity ?? 0),
                      },
                    }));
                  }}
                />
              </label>
              <label className='v2-field'>
                <span>Tỷ lệ thu hồi dự kiến</span>
                <InputNumber
                  min={1}
                  max={100}
                  precision={1}
                  addonAfter='%'
                  value={value.expectedYieldPercent}
                  onChange={(expectedYieldPercent) => {
                    setDirty(true);
                    setComponentValues((current) => ({
                      ...current,
                      [component.inventoryItemId]: {
                        ...value,
                        expectedYieldPercent: Number(expectedYieldPercent ?? 0),
                      },
                    }));
                  }}
                />
              </label>
            </div>
          );
        })}
      </div>
      <div className='v2-recipe-config-footer'>
        <label className='v2-field'>
          <span>Hạn dùng sau khi hoàn tất</span>
          <InputNumber
            min={1}
            max={720}
            precision={0}
            addonAfter='giờ'
            value={shelfLifeHours}
            onChange={(value) => {
              setDirty(true);
              setShelfLifeHours(Number(value ?? 0));
            }}
          />
        </label>
        <Text type='secondary'>Bản nháp v{formatNumber(recipe?.versionNumber ?? recipe?.version)}</Text>
        <Space wrap>
          <Button
            icon={<SaveOutlined />}
            loading={saving}
            disabled={invalidComponents || shelfLifeHours <= 0}
            onClick={handleSave}
          >
            Tạo bản định mức
          </Button>
          <Button
            type='primary'
            icon={<CheckOutlined />}
            loading={saving}
            disabled={invalidComponents || shelfLifeHours <= 0}
            onClick={handleRelease}
          >
            Lưu & phát hành
          </Button>
        </Space>
      </div>
    </Card>
  );
}
