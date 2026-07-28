'use client';

import {
  BarChartOutlined,
  CalendarOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  FilterOutlined,
  InboxOutlined,
  PlusOutlined,
  ReloadOutlined,
  RightOutlined,
  SearchOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Pagination,
  Popconfirm,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useMemo, useState, type Key } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { RouteSkeleton } from '@/components/common/route-skeleton';
import { useApiData } from '@/hooks/use-api-data';
import { formatDate, formatNumber, formatVnd, formatVndInput, parseVndInput } from '@/lib/formatters';
import {
  DEFAULT_LEGACY_PURCHASE_FUNDING_SOURCE,
  PURCHASE_FUNDING_SOURCE_OPTIONS,
  purchaseFundingSourceLabel,
  type PurchaseFundingSource,
} from '@/lib/purchase-funding';
import { workbookIngredients, workbookPurchases } from '@/lib/workbook-snapshot';

const { RangePicker } = DatePicker;
const { Text } = Typography;

type Ingredient = {
  id?: string;
  _id?: string;
  code: string;
  name: string;
  category: string;
  packageQuantity: number;
  costUnit: string;
  referencePackagePrice: number;
  isActive: boolean;
};

type Purchase = {
  id?: string;
  _id?: string;
  ingredientId?: string;
  purchaseDate: string;
  itemCode: string;
  itemName: string;
  category: string;
  packageCount: number;
  packageQuantity: number;
  costUnit: string;
  referencePackagePrice?: number;
  actualPackagePrice: number;
  convertedQuantity: number;
  totalAmount: number;
  fundingSource?: PurchaseFundingSource;
  supplier?: string;
  note?: string;
};

type PurchaseForm = {
  purchaseDate: Dayjs;
  ingredientId: string;
  packageCount: number;
  totalAmount?: number;
  fundingSource: PurchaseFundingSource;
  supplier?: string;
  note?: string;
};

function recordId(record: { id?: string; _id?: string }) {
  return record.id ?? record._id ?? '';
}

function comparePurchasesByDate(a: Purchase, b: Purchase) {
  const dateDifference = dayjs(b.purchaseDate).valueOf() - dayjs(a.purchaseDate).valueOf();
  if (dateDifference !== 0) return dateDifference;
  return recordId(b).localeCompare(recordId(a), 'vi');
}

function purchaseKey(record: Purchase) {
  return recordId(record) || `${record.purchaseDate}:${record.itemCode}:${record.packageCount}`;
}

function fundingSourceTagColor(source?: PurchaseFundingSource) {
  switch (source ?? DEFAULT_LEGACY_PURCHASE_FUNDING_SOURCE) {
    case 'sales_revenue':
      return 'green';
    case 'owner_capital':
      return 'blue';
    case 'loan':
      return 'orange';
    default:
      return 'default';
  }
}

export default function PurchasesPage() {
  const { message } = App.useApp();
  const [form] = Form.useForm<PurchaseForm>();
  const [query, setQuery] = useState('');
  const [dateRange, setDateRange] = useState<[string, string] | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>();
  const [fundingSourceFilter, setFundingSourceFilter] = useState<PurchaseFundingSource>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Purchase | null>(null);
  const [saving, setSaving] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [selectedPurchaseKeys, setSelectedPurchaseKeys] = useState<Key[]>([]);
  const [mobilePage, setMobilePage] = useState(1);
  const {
    data: purchases,
    loading: purchasesLoading,
    usingFallback: purchasesFallback,
    setData: setPurchases,
  } = useApiData<Purchase[]>('/api/purchases?limit=500', workbookPurchases);
  const {
    data: ingredients,
    loading: ingredientsLoading,
    usingFallback: ingredientsFallback,
  } = useApiData<Ingredient[]>('/api/ingredients?limit=500', workbookIngredients);

  const selectedIngredientId = Form.useWatch('ingredientId', form);
  const packageCount = Form.useWatch('packageCount', form) ?? 0;
  const enteredTotalAmount = Form.useWatch('totalAmount', form);
  const ingredientById = useMemo(() => new Map(ingredients.map(ingredient => [recordId(ingredient), ingredient])), [ingredients]);
  const selectedIngredient = selectedIngredientId ? ingredientById.get(selectedIngredientId) : undefined;
  const convertedQuantity = packageCount * (selectedIngredient?.packageQuantity ?? 0);
  const effectivePrice =
    packageCount > 0 && enteredTotalAmount !== undefined ? enteredTotalAmount / packageCount : (selectedIngredient?.referencePackagePrice ?? 0);
  const normalizedQuery = query.trim().toLocaleLowerCase('vi');
  const categoryOptions = useMemo(
    () =>
      Array.from(new Set(purchases.map(purchase => purchase.category).filter((category): category is string => Boolean(category))))
        .toSorted((a, b) => a.localeCompare(b, 'vi'))
        .map(category => ({ label: category, value: category })),
    [purchases],
  );
  const visiblePurchases = useMemo(() => {
    const filtered = purchases.filter(purchase => {
      const purchaseDay = dayjs(purchase.purchaseDate).format('YYYY-MM-DD');
      if (dateRange && (purchaseDay < dateRange[0] || purchaseDay > dateRange[1])) {
        return false;
      }
      if (categoryFilter && purchase.category !== categoryFilter) return false;
      if (fundingSourceFilter && (purchase.fundingSource ?? DEFAULT_LEGACY_PURCHASE_FUNDING_SOURCE) !== fundingSourceFilter) {
        return false;
      }
      if (!normalizedQuery) return true;

      return [
        purchase.itemName,
        purchase.itemCode,
        purchase.category,
        purchaseFundingSourceLabel(purchase.fundingSource),
        purchase.supplier,
        purchase.note,
      ].some(value =>
        String(value ?? '')
          .toLocaleLowerCase('vi')
          .includes(normalizedQuery),
      );
    });
    return filtered.toSorted(comparePurchasesByDate);
  }, [categoryFilter, dateRange, fundingSourceFilter, normalizedQuery, purchases]);
  const purchaseSummary = useMemo(() => {
    let totalAmount = 0;
    let totalPackages = 0;
    for (const purchase of visiblePurchases) {
      totalAmount += Number(purchase.totalAmount ?? 0);
      totalPackages += Number(purchase.packageCount ?? 0);
    }
    return {
      totalAmount,
      totalPackages,
      purchaseCount: visiblePurchases.length,
      averageAmount: visiblePurchases.length > 0 ? totalAmount / visiblePurchases.length : 0,
    };
  }, [visiblePurchases]);
  const mobilePageSize = 10;
  const safeMobilePage = Math.min(mobilePage, Math.max(1, Math.ceil(visiblePurchases.length / mobilePageSize)));
  const mobilePurchases = visiblePurchases.slice((safeMobilePage - 1) * mobilePageSize, safeMobilePage * mobilePageSize);
  const selectedPurchaseKeySet = useMemo(() => new Set(selectedPurchaseKeys), [selectedPurchaseKeys]);
  const selectedPurchaseSummary = useMemo(() => {
    let count = 0;
    let totalAmount = 0;
    for (const purchase of purchases) {
      if (!selectedPurchaseKeySet.has(purchaseKey(purchase))) continue;
      count += 1;
      totalAmount += Number(purchase.totalAmount ?? 0);
    }
    return { count, totalAmount };
  }, [purchases, selectedPurchaseKeySet]);
  const visiblePurchaseKeys = useMemo(() => visiblePurchases.map(purchaseKey), [visiblePurchases]);
  const selectedVisiblePurchaseCount = useMemo(() => {
    let count = 0;
    for (const key of visiblePurchaseKeys) {
      if (selectedPurchaseKeySet.has(key)) count += 1;
    }
    return count;
  }, [selectedPurchaseKeySet, visiblePurchaseKeys]);
  const allVisiblePurchasesSelected = visiblePurchaseKeys.length > 0 && selectedVisiblePurchaseCount === visiblePurchaseKeys.length;
  const hasActiveFilters = Boolean(normalizedQuery || dateRange || categoryFilter || fundingSourceFilter);
  const activeFilterCount = [Boolean(dateRange), Boolean(categoryFilter), Boolean(fundingSourceFilter)].filter(Boolean).length;

  const columns: ColumnsType<Purchase> = [
    {
      title: 'Ngày nhập',
      dataIndex: 'purchaseDate',
      render: formatDate,
    },
    {
      title: 'Tên hàng',
      dataIndex: 'itemName',
      render: (value, record) => (
        <Space size={6}>
          <Text strong>{String(value)}</Text>
          <Tag>{record.itemCode}</Tag>
        </Space>
      ),
    },
    { title: 'Nhóm', dataIndex: 'category' },
    {
      title: 'Số gói',
      dataIndex: 'packageCount',
      align: 'right',
      render: value => formatNumber(Number(value)),
    },
    {
      title: 'Quy cách/gói',
      key: 'packageSpec',
      align: 'right',
      render: (_value, record) => `${formatNumber(record.packageQuantity)} ${record.costUnit}`,
    },
    {
      title: 'Giá thực tế/gói',
      dataIndex: 'actualPackagePrice',
      align: 'right',
      render: value => formatVnd(Number(value)),
    },
    {
      title: 'Tổng lượng',
      dataIndex: 'convertedQuantity',
      align: 'right',
      render: (value, record) => `${formatNumber(Number(value))} ${record.costUnit}`,
    },
    {
      title: 'Tổng tiền',
      dataIndex: 'totalAmount',
      align: 'right',
      render: value => <Text strong>{formatVnd(Number(value))}</Text>,
    },
    {
      title: 'Nguồn tiền',
      dataIndex: 'fundingSource',
      render: (value: PurchaseFundingSource | undefined) => <Tag color={fundingSourceTagColor(value)}>{purchaseFundingSourceLabel(value)}</Tag>,
    },
    { title: 'Nhà cung cấp', dataIndex: 'supplier' },
    {
      title: '',
      key: 'actions',
      fixed: 'right',
      render: (_value, record) => renderPurchaseActions(record),
    },
  ];

  function renderPurchaseActions(record: Purchase, mobile = false) {
    return (
      <Space size={mobile ? 8 : 2} className={mobile ? 'purchase-card-actions' : undefined}>
        <Button
          type={mobile ? 'default' : 'text'}
          size={mobile ? 'large' : 'middle'}
          icon={<EditOutlined />}
          aria-label={`Sửa lần nhập ${record.itemName}`}
          onClick={() => openEditor(record)}>
          {mobile ? 'Sửa' : null}
        </Button>
        <Popconfirm
          title='Xóa lần nhập này?'
          description='Giá vốn bình quân của hàng hóa sẽ được tính lại.'
          okText='Xóa'
          cancelText='Hủy'
          okButtonProps={{ danger: true }}
          onConfirm={() => removeRecord(record)}>
          <Button
            type={mobile ? 'default' : 'text'}
            size={mobile ? 'large' : 'middle'}
            danger
            icon={<DeleteOutlined />}
            aria-label={`Xóa lần nhập ${record.itemName}`}>
            {mobile ? 'Xóa' : null}
          </Button>
        </Popconfirm>
      </Space>
    );
  }

  function closeEditor() {
    setDrawerOpen(false);
    setEditing(null);
    form.resetFields();
  }

  function clearFilters() {
    setQuery('');
    setDateRange(null);
    setCategoryFilter(undefined);
    setFundingSourceFilter(undefined);
  }

  function togglePurchaseSelection(key: Key, checked: boolean) {
    setSelectedPurchaseKeys(current => {
      const next = new Set(current);
      if (checked) next.add(key);
      else next.delete(key);
      return Array.from(next);
    });
  }

  function toggleAllVisiblePurchases(checked: boolean) {
    setSelectedPurchaseKeys(current => {
      const next = new Set(current);
      for (const key of visiblePurchaseKeys) {
        if (checked) next.add(key);
        else next.delete(key);
      }
      return Array.from(next);
    });
  }

  function openEditor(record?: Purchase) {
    const ingredient = record ? ingredients.find(item => recordId(item) === String(record.ingredientId ?? '') || item.code === record.itemCode) : undefined;
    setEditing(record ?? null);
    form.setFieldsValue(
      record
        ? {
            purchaseDate: dayjs(record.purchaseDate),
            ingredientId: ingredient ? recordId(ingredient) : undefined,
            packageCount: record.packageCount,
            totalAmount: record.totalAmount,
            fundingSource: record.fundingSource ?? DEFAULT_LEGACY_PURCHASE_FUNDING_SOURCE,
            supplier: record.supplier,
            note: record.note,
          }
        : {
            purchaseDate: dayjs(),
            packageCount: 1,
            fundingSource: 'sales_revenue',
          },
    );
    setDrawerOpen(true);
  }

  async function saveRecord(values: PurchaseForm) {
    setSaving(true);
    try {
      const id = editing ? recordId(editing) : '';
      const response = await fetch(id ? `/api/purchases/${id}` : '/api/purchases', {
        method: id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purchaseDate: values.purchaseDate.toISOString(),
          ingredientId: values.ingredientId,
          packageCount: values.packageCount,
          totalAmount: values.totalAmount,
          fundingSource: values.fundingSource,
          supplier: values.supplier ?? '',
          note: values.note ?? '',
        }),
      });
      const body = (await response.json()) as {
        success: boolean;
        message: string;
        data?: Purchase;
      };
      if (!response.ok || !body.success || !body.data) {
        throw new Error(body.message);
      }
      setPurchases(current => (id ? current.map(item => (recordId(item) === id ? (body.data as Purchase) : item)) : [body.data as Purchase, ...current]));
      message.success(body.message);
      closeEditor();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Không thể lưu lần nhập');
    } finally {
      setSaving(false);
    }
  }

  async function removeRecord(record: Purchase) {
    const id = recordId(record);
    if (!id) return;
    try {
      const response = await fetch(`/api/purchases/${id}`, {
        method: 'DELETE',
      });
      const body = (await response.json()) as {
        success: boolean;
        message: string;
      };
      if (!response.ok || !body.success) throw new Error(body.message);
      setPurchases(current => current.filter(item => recordId(item) !== id));
      message.success(body.message);
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Không thể xóa lần nhập');
    }
  }

  if (purchasesLoading || ingredientsLoading) {
    return <RouteSkeleton />;
  }

  return (
    <div className='page-wrap'>
      <PageHeader title='Nhập hàng' description='Ghi tổng tiền đã thanh toán và nguồn tiền sử dụng; đơn giá thực tế và giá vốn được tự tính.' />
      {(purchasesFallback || ingredientsFallback) && (
        <Alert
          type='info'
          showIcon
          title='Danh mục đang lấy từ snapshot Excel'
          description='Có thể xem và thử giao diện; để lưu cần MongoDB và dữ liệu đã import.'
          style={{ marginBottom: 16 }}
        />
      )}
      <Card className='surface-card table-card'>
        <div className='purchase-overview'>
          <div className='purchase-filter-heading'>
           
            <Button className='purchase-desktop-filter-reset' type='text' icon={<ReloadOutlined />} disabled={!hasActiveFilters} onClick={clearFilters}>
              Đặt lại
            </Button>
          </div>
          <div className='purchase-summary-grid'>
            <Card size='small' className='surface-card kpi-card purchase-summary-card purchase-summary-card-total'>
              <Statistic
                title={
                  <span className='purchase-summary-title'>
                    <WalletOutlined />
                    Tổng tiền
                  </span>
                }
                value={purchaseSummary.totalAmount}
                formatter={value => formatVnd(Number(value))}
              />
            </Card>
            <Card size='small' className='surface-card kpi-card purchase-summary-card purchase-summary-card-count'>
              <Statistic
                title={
                  <span className='purchase-summary-title'>
                    <CalendarOutlined />
                    Số lần nhập
                  </span>
                }
                value={purchaseSummary.purchaseCount}
                suffix='lần'
                formatter={value => formatNumber(Number(value))}
              />
            </Card>
            <Card size='small' className='surface-card kpi-card purchase-summary-card purchase-summary-card-packages purchase-summary-secondary'>
              <Statistic
                title={
                  <span className='purchase-summary-title'>
                    <InboxOutlined />
                    Tổng số gói
                  </span>
                }
                value={purchaseSummary.totalPackages}
                suffix='gói'
                formatter={value => formatNumber(Number(value))}
              />
            </Card>
            <Card size='small' className='surface-card kpi-card purchase-summary-card purchase-summary-card-average purchase-summary-secondary'>
              <Statistic
                title={
                  <span className='purchase-summary-title'>
                    <BarChartOutlined />
                    Bình quân/lần
                  </span>
                }
                value={purchaseSummary.averageAmount}
                formatter={value => formatVnd(Number(value))}
              />
            </Card>
          </div>
          <div className='purchase-mobile-search-row'>
            <div className='purchase-mobile-search'>
              <Input
                allowClear
                prefix={<SearchOutlined />}
                placeholder='Tìm tên hàng, mã, nhà cung cấp…'
                value={query}
                onChange={event => setQuery(event.target.value)}
              />
            </div>
            <Button
              className='purchase-mobile-filter-toggle'
              type={activeFilterCount > 0 ? 'primary' : 'default'}
              icon={<FilterOutlined />}
              aria-expanded={mobileFiltersOpen}
              aria-controls='purchase-mobile-filters'
              onClick={() => setMobileFiltersOpen(current => !current)}>
              Lọc{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </Button>
          </div>
          <div id='purchase-mobile-filters' className={`purchase-filter-grid ${mobileFiltersOpen ? 'is-mobile-open' : ''}`}>
            <div className='purchase-desktop-search'>
              <Input
                allowClear
                prefix={<SearchOutlined />}
                placeholder='Tìm tên hàng, mã, nhà cung cấp…'
                value={query}
                onChange={event => setQuery(event.target.value)}
              />
            </div>
            <RangePicker
              allowClear
              format='DD/MM/YYYY'
              placeholder={['Từ ngày', 'Đến ngày']}
              value={dateRange ? [dayjs(dateRange[0]), dayjs(dateRange[1])] : null}
              onChange={dates => {
                setDateRange(dates?.[0] && dates[1] ? [dates[0].format('YYYY-MM-DD'), dates[1].format('YYYY-MM-DD')] : null);
              }}
            />
            <Select allowClear placeholder='Tất cả nhóm hàng' options={categoryOptions} value={categoryFilter} onChange={setCategoryFilter} />
            <Select
              allowClear
              placeholder='Tất cả nguồn tiền'
              options={PURCHASE_FUNDING_SOURCE_OPTIONS}
              value={fundingSourceFilter}
              onChange={setFundingSourceFilter}
            />
            <div className='purchase-mobile-filter-actions'>
              <Button icon={<ReloadOutlined />} disabled={!hasActiveFilters} onClick={clearFilters}>
                Đặt lại
              </Button>
              <Button icon={<DownloadOutlined />} href='/api/export/purchases' target='_blank'>
                Xuất Excel
              </Button>
            </div>
          </div>
          
        </div>
        <div className='table-toolbar purchase-action-toolbar'>
          <div className='purchase-list-heading'>
            <div className='purchase-list-title'>
              <Text strong>Danh sách nhập hàng</Text>
              <Checkbox
                className='purchase-mobile-select-all'
                checked={allVisiblePurchasesSelected}
                indeterminate={selectedVisiblePurchaseCount > 0 && !allVisiblePurchasesSelected}
                disabled={visiblePurchaseKeys.length === 0}
                onChange={event => toggleAllVisiblePurchases(event.target.checked)}>
                Chọn tất cả
              </Checkbox>
            </div>
            <div className='purchase-selection-summary' aria-live='polite'>
              <Text type='secondary'>Đã chọn {formatNumber(selectedPurchaseSummary.count)} dòng</Text>
              <Text strong>Tổng đã chọn: {formatVnd(selectedPurchaseSummary.totalAmount)}</Text>
            </div>
          </div>
          <Space>
            <Button icon={<DownloadOutlined />} href='/api/export/purchases' target='_blank'>
              Xuất Excel
            </Button>
            <Button type='primary' icon={<PlusOutlined />} onClick={() => openEditor()}>
              Thêm lần nhập
            </Button>
          </Space>
        </div>
        <div className='purchase-desktop-table'>
          <Table
            size='small'
            rowKey={purchaseKey}
            columns={columns}
            dataSource={visiblePurchases}
            rowSelection={{
              selectedRowKeys: selectedPurchaseKeys,
              onChange: setSelectedPurchaseKeys,
              columnWidth: 44,
              preserveSelectedRowKeys: true,
              getCheckboxProps: record => ({
                'aria-label': `Chọn lần nhập ${record.itemName}`,
              }),
            }}
            pagination={{ defaultPageSize: 50, showSizeChanger: false }}
            scroll={{ x: 'max-content' }}
          />
        </div>
        <div className='purchase-mobile-list'>
          {mobilePurchases.length > 0 ? (
            <div className='ant-list-items'>
              {mobilePurchases.map(record => (
                <div className='ant-list-item purchase-mobile-item' key={purchaseKey(record)}>
                  <article className='purchase-mobile-card'>
                    <Checkbox
                      className='purchase-card-checkbox'
                      checked={selectedPurchaseKeySet.has(purchaseKey(record))}
                      aria-label={`Chọn lần nhập ${record.itemName}`}
                      onChange={event => togglePurchaseSelection(purchaseKey(record), event.target.checked)}
                    />
                    <button
                      type='button'
                      className='purchase-card-main'
                      onClick={() => openEditor(record)}
                      aria-label={`Xem và sửa lần nhập ${record.itemName}`}>
                      <span className='purchase-card-heading'>
                        <span>
                          <Text strong className='purchase-card-name'>
                            {record.itemName}
                          </Text>
                          <span className='purchase-card-identity'>
                            <Tag>{record.itemCode}</Tag>
                            <Text type='secondary'>{record.category}</Text>
                          </span>
                        </span>
                        <span className='purchase-card-aside'>
                          <Text type='secondary'>{formatDate(record.purchaseDate)}</Text>
                          <Text strong>{formatVnd(record.totalAmount)}</Text>
                        </span>
                      </span>
                      <span className='purchase-card-summary'>
                        <Text>{formatNumber(record.packageCount)} gói</Text>
                        <Text>
                          {formatNumber(record.convertedQuantity)} {record.costUnit}
                        </Text>
                        <Tag color={fundingSourceTagColor(record.fundingSource)}>{purchaseFundingSourceLabel(record.fundingSource)}</Tag>
                        <RightOutlined aria-hidden />
                      </span>
                    </button>
                  </article>
                </div>
              ))}
            </div>
          ) : (
            <Empty description='Chưa có lần nhập hàng' />
          )}
          {visiblePurchases.length > mobilePageSize ? (
            <Pagination
              className='purchase-mobile-pagination'
              current={safeMobilePage}
              pageSize={mobilePageSize}
              total={visiblePurchases.length}
              showSizeChanger={false}
              size='small'
              align='center'
              onChange={setMobilePage}
            />
          ) : null}
        </div>
      </Card>

      <Drawer
        open={drawerOpen}
        className='purchase-drawer'
        title={editing ? 'Chỉnh sửa lần nhập' : 'Thêm lần nhập'}
        placement='right'
        size='large'
        onClose={closeEditor}
        destroyOnHidden
        footer={
          <div className='purchase-drawer-footer'>
            <div>
              {editing ? (
                <Popconfirm
                  title='Xóa lần nhập này?'
                  description='Giá vốn bình quân của hàng hóa sẽ được tính lại.'
                  okText='Xóa'
                  cancelText='Hủy'
                  okButtonProps={{ danger: true }}
                  onConfirm={async () => {
                    await removeRecord(editing);
                    closeEditor();
                  }}>
                  <Button danger size='large' icon={<DeleteOutlined />}>
                    Xóa
                  </Button>
                </Popconfirm>
              ) : null}
            </div>
            <Space>
              <Button size='large' onClick={closeEditor}>
                Hủy
              </Button>
              <Button type='primary' size='large' loading={saving} onClick={() => form.submit()}>
                {editing ? 'Lưu thay đổi' : 'Lưu lần nhập'}
              </Button>
            </Space>
          </div>
        }>
        <Form<PurchaseForm> form={form} layout='vertical' onFinish={saveRecord}>
          <div className='purchase-form-grid'>
            <Form.Item name='purchaseDate' label='Ngày nhập' rules={[{ required: true, message: 'Vui lòng chọn ngày nhập' }]}>
              <DatePicker format='DD/MM/YYYY' style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name='ingredientId' label='Tên hàng' rules={[{ required: true, message: 'Vui lòng chọn hàng có sẵn' }]}>
              <Select
                showSearch
                optionFilterProp='label'
                placeholder='Chọn từ danh mục Hàng hóa'
                options={ingredients
                  .filter(ingredient => ingredient.isActive)
                  .map(ingredient => ({
                    value: recordId(ingredient),
                    label: `${ingredient.name} · ${ingredient.code}`,
                  }))}
                onChange={ingredientId => {
                  const ingredient = ingredientById.get(ingredientId);
                  form.setFieldValue('totalAmount', packageCount * (ingredient?.referencePackagePrice ?? 0));
                }}
              />
            </Form.Item>
            <Form.Item
              name='packageCount'
              label='Số gói mua'
              rules={[
                { required: true, message: 'Vui lòng nhập số gói' },
                {
                  type: 'number',
                  min: 0.000001,
                  message: 'Số gói phải lớn hơn 0',
                },
              ]}>
              <InputNumber
                min={0}
                inputMode='decimal'
                style={{ width: '100%' }}
                onChange={value => {
                  const referencePackagePrice = selectedIngredient?.referencePackagePrice ?? 0;
                  const referenceTotal = packageCount * referencePackagePrice;
                  if (enteredTotalAmount === undefined || enteredTotalAmount === referenceTotal) {
                    form.setFieldValue('totalAmount', Number(value ?? 0) * referencePackagePrice);
                  }
                }}
              />
            </Form.Item>
            <Form.Item
              name='totalAmount'
              label='Tổng tiền thanh toán'
              tooltip='Nhập toàn bộ số tiền thực trả, bao gồm tiền hàng, phí ship và các chi phí mua hàng khác.'
              rules={[
                {
                  required: true,
                  message: 'Vui lòng nhập tổng tiền đã thanh toán',
                },
                {
                  type: 'number',
                  min: 0,
                  message: 'Tổng tiền không được âm',
                },
              ]}>
              <InputNumber min={0} precision={0} inputMode='numeric' style={{ width: '100%' }} formatter={formatVndInput} parser={parseVndInput} />
            </Form.Item>
            <Form.Item
              name='fundingSource'
              label='Nguồn tiền'
              tooltip='Chỉ nguồn Vốn chủ mới làm tăng Tổng vốn đã bỏ và phần vốn cần thu hồi. Các nguồn khác vẫn được tính là tiền ra trong kỳ.'
              rules={[
                {
                  required: true,
                  message: 'Vui lòng chọn nguồn tiền',
                },
              ]}>
              <Select placeholder='Chọn nguồn dùng để thanh toán' options={PURCHASE_FUNDING_SOURCE_OPTIONS} />
            </Form.Item>
            <Form.Item name='supplier' label='Nhà cung cấp'>
              <Input placeholder='Không bắt buộc' />
            </Form.Item>
            <Form.Item name='note' label='Ghi chú'>
              <Input.TextArea rows={3} placeholder='Không bắt buộc' />
            </Form.Item>
          </div>
        </Form>

        <Card size='small' title='Thông tin tự động' className='calculated-card'>
          <Descriptions size='small' bordered column={1}>
            <Descriptions.Item label='Mã nội bộ'>{selectedIngredient?.code ?? '—'}</Descriptions.Item>
            <Descriptions.Item label='Nhóm'>{selectedIngredient?.category ?? '—'}</Descriptions.Item>
            <Descriptions.Item label='Quy cách/gói'>
              {selectedIngredient ? `${formatNumber(selectedIngredient.packageQuantity)} ${selectedIngredient.costUnit}` : '—'}
            </Descriptions.Item>
            <Descriptions.Item label='Giá tham khảo/gói'>{selectedIngredient ? formatVnd(selectedIngredient.referencePackagePrice) : '—'}</Descriptions.Item>
            <Descriptions.Item label='Giá thực tế/gói'>{selectedIngredient && packageCount > 0 ? formatVnd(effectivePrice) : '—'}</Descriptions.Item>
            <Descriptions.Item label='Tổng lượng quy đổi'>
              {selectedIngredient ? `${formatNumber(convertedQuantity)} ${selectedIngredient.costUnit}` : '—'}
            </Descriptions.Item>
            <Descriptions.Item label='Tổng tiền'>
              <Text strong>{formatVnd(enteredTotalAmount ?? 0)}</Text>
            </Descriptions.Item>
          </Descriptions>
        </Card>
      </Drawer>
      <div className='mobile-workflow-dock purchase-mobile-add-dock'>
        <div>
          <Text type='secondary'>Thao tác nhanh</Text>
          <Text strong>Ghi hàng vừa mua</Text>
        </div>
        <Button className='purchase-mobile-fab' type='primary' icon={<PlusOutlined />} aria-label='Thêm nhập hàng' onClick={() => openEditor()} />
      </div>
    </div>
  );
}
