export interface CategoryFormData {
  name: string;
  slug?: string;
  description?: string;
  image?: string;
  icon?: string;
  parentId?: string | null;
  displayOrder?: number;
  isActive?: boolean;
  isFeatured?: boolean;
  seoTitle?: string;
  seoDescription?: string;
}

export function prepareCategoryPayload(formData: CategoryFormData) {
  const normalizedParentId =
    formData.parentId && typeof formData.parentId === 'string' && formData.parentId.trim() !== ''
      ? formData.parentId.trim()
      : null;

  return {
    ...formData,
    name: typeof formData.name === 'string' ? formData.name.trim() : formData.name,
    slug: formData.slug && typeof formData.slug === 'string' && formData.slug.trim() !== '' ? formData.slug.trim() : undefined,
    parentId: normalizedParentId,
  };
}
