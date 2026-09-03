(function ($, window) {
  'use strict';

  // Manual product.metafields.upsell.items cards are rendered first by
  // search.upsell.liquid. This module only fills additional rule-based slots.
  var jsonCache = {};
  var BOX_COLLECTIONS = window.ATC_UPSELL_BOX_COLLECTIONS || {};
  var DISPLAY_COLLECTIONS = window.ATC_UPSELL_DISPLAY_COLLECTIONS || {};
  var BAG_COLLECTIONS = window.ATC_UPSELL_BAG_COLLECTIONS || [];
  var RIBBON_COLLECTIONS = window.ATC_UPSELL_RIBBON_COLLECTIONS || [];

  function getJSON(url) {
    if (!jsonCache[url]) {
      jsonCache[url] = fetch(url, { credentials: 'same-origin' }).then(function (response) {
        if (!response.ok) {
          throw new Error('ATC upsell request failed: ' + response.status);
        }
        return response.json();
      });
    }

    return jsonCache[url];
  }

  function getProduct(handle) {
    return getJSON('/products/' + encodeURIComponent(handle) + '.js');
  }

  function getCollection(handle) {
    return getJSON('/collections/' + encodeURIComponent(handle) + '/products.json?limit=250')
      .then(function (response) {
        return response.products || [];
      });
  }

  function shuffled(items) {
    var copy = items.slice();
    var index;
    var swapIndex;
    var item;

    for (index = copy.length - 1; index > 0; index -= 1) {
      swapIndex = Math.floor(Math.random() * (index + 1));
      item = copy[index];
      copy[index] = copy[swapIndex];
      copy[swapIndex] = item;
    }

    return copy;
  }

  function normalized(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function exactColor(left, right) {
    return normalized(left) === normalized(right);
  }

  function colorFamily(color, includeExtendedFamilies) {
    var value = normalized(color);

    if (/charcoal|grey|gray|silver/.test(value)) {
      return 'grey';
    }
    if (/black/.test(value)) {
      return 'black';
    }
    if (/ivory|cream|french vanilla/.test(value)) {
      return 'cream';
    }
    if (/white/.test(value)) {
      return 'white';
    }
    if (/bronze|copper|brown/.test(value)) {
      return 'brown';
    }

    if (includeExtendedFamilies) {
      if (/pink|raspberry|rose fog/.test(value)) {
        return 'pink';
      }
      if (/burgundy/.test(value)) {
        return 'burgundy';
      }
      if (/blue|navy|teal/.test(value)) {
        return 'blue';
      }
    }

    return '';
  }

  function availableVariants(product) {
    return (product.variants || []).filter(function (variant) {
      return variant.available;
    });
  }

  function variantByExactColor(product, color) {
    return availableVariants(product).find(function (variant) {
      return exactColor(variant.option1, color);
    });
  }

  function variantByFamily(product, family, includeExtendedFamilies) {
    return availableVariants(product).find(function (variant) {
      return colorFamily(variant.option1, includeExtendedFamilies) === family;
    });
  }

  function variantForColor(product, color, includeExtendedFamilies, fallbackColor) {
    var family = colorFamily(color, includeExtendedFamilies);
    var variant = variantByExactColor(product, color);

    if (!variant && family) {
      variant = variantByFamily(product, family, includeExtendedFamilies);
    }
    if (!variant && fallbackColor) {
      variant = variantByExactColor(product, fallbackColor);
    }

    return variant;
  }

  function productTags(product) {
    if (Array.isArray(product.tags)) {
      return product.tags.map(normalized);
    }

    return String(product.tags || '').split(',').map(normalized);
  }

  function isBox(product) {
    return productTags(product).indexOf('box') !== -1 ||
      /\bbox(?:es)?\b/.test(normalized(product.title));
  }

  function isDisplay(product) {
    return productTags(product).indexOf('display') !== -1 ||
      /\bdisplays?\b/.test(normalized(product.title));
  }

  function isBag(product) {
    var type = normalized(product.type);
    var tags = productTags(product);
    var title = normalized(product.title);

    return type === 'bag' || type === 'large bag' ||
      tags.indexOf('type bag') !== -1 || tags.indexOf('type large bag') !== -1 ||
      /\bbags?\b/.test(title);
  }

  function productType(product) {
    var tags = productTags(product);
    var title = normalized(product.title);
    var typeTags = tags.filter(function (tag) {
      return tag.indexOf('type ') === 0;
    }).map(function (tag) {
      return tag.replace(/^type\s+/, '');
    });
    var priorities = [
      'double ring', 'clip', 'cufflink', 'bracelet', 'earring', 'pendant',
      'necklace', 'watch', 'bangle', 'pillow', 'universal', 'ring'
    ];
    var match = priorities.find(function (type) {
      return typeTags.indexOf(type) !== -1;
    });
    var titleMatch;

    titleMatch = [
        { type: 'double ring', pattern: /\bdouble ring\b/ },
        { type: 'clip', pattern: /\bclip\b/ },
        { type: 'cufflink', pattern: /\bcufflinks?\b/ },
        { type: 'bracelet', pattern: /\bbracelets?\b/ },
        { type: 'earring', pattern: /\bearrings?\b|\bstuds?\b/ },
        { type: 'pendant', pattern: /\bpendants?\b/ },
        { type: 'necklace', pattern: /\bnecklaces?\b|\bneck\b/ },
        { type: 'watch', pattern: /\bwatches?\b/ },
        { type: 'bangle', pattern: /\bbangles?\b/ },
        { type: 'pillow', pattern: /\bpillows?\b/ },
        { type: 'universal', pattern: /\buniversal\b|\butility\b/ },
        { type: 'ring', pattern: /\brings?\b/ }
      ].map(function (candidate) {
        return candidate.pattern.test(title) ? candidate.type : null;
      }).find(Boolean);

    if (!match) {
      match = titleMatch;
    }

    return (match || normalized(product.type)).replace(/\s+/g, '-');
  }

  function displayCollectionForType(type) {
    var aliases = [type, type + '-display', type + '-displays'];

    if (type === 'double-ring') {
      aliases = aliases.concat(['ring', 'ring-display', 'ring-displays']);
    }
    if (type === 'necklace') {
      aliases = aliases.concat(['neck', 'neck-display', 'neck-displays']);
    }
    if (type === 'bangle' || type === 'watch') {
      aliases = aliases.concat([
        'bangle-watch', 'bangle-watch-display', 'bangle-watch-displays'
      ]);
    }

    return aliases.map(function (alias) {
      return DISPLAY_COLLECTIONS[alias];
    }).find(Boolean);
  }

  function boxCollectionForType(type) {
    var aliases = [type, type + '-box', type + '-boxes'];

    if (type === 'neck') {
      aliases = aliases.concat(['necklace', 'necklace-box', 'necklace-boxes']);
    }

    return aliases.map(function (alias) {
      return BOX_COLLECTIONS[alias];
    }).find(Boolean);
  }

  function excludedHandles($container, sourceHandle) {
    var excluded = {};

    excluded[sourceHandle] = true;
    if (window.CART && Array.isArray(window.CART.items)) {
      window.CART.items.forEach(function (item) {
        excluded[item.handle] = true;
      });
    }

    $container.find('.upsell-item').each(function () {
      var $item = $(this);
      var handle = $item.data('upsell-handle');
      var hrefMatch;

      if (!handle) {
        hrefMatch = String($item.attr('href') || '').match(/\/products\/([^?#/]+)/);
        handle = hrefMatch && hrefMatch[1];
      }
      if (handle) {
        excluded[handle] = true;
      }
    });

    return excluded;
  }

  function collectionSearchTerm(product) {
    var titleMatch = String(product.title || '').match(/,\s*([^,]+ Collection)\s*$/i);
    var handleMatch;

    if (titleMatch) {
      return titleMatch[1];
    }

    handleMatch = String(product.handle || '').match(/^(.+?)-(?:double-)?(?:ring|bracelet|earring|pendant|necklace|watch|bangle|pillow|universal|cufflink|clip)(?:-|$)/i);
    return handleMatch ? handleMatch[1].replace(/-/g, ' ') : '';
  }

  function firstMatchingProduct(summaries, matcher, index) {
    if (index >= summaries.length) {
      return Promise.resolve(null);
    }

    return getProduct(summaries[index].handle)
      .then(function (product) {
        var variant = matcher(product);
        if (variant) {
          return { product: product, variant: variant };
        }
        return firstMatchingProduct(summaries, matcher, index + 1);
      })
      .catch(function () {
        return firstMatchingProduct(summaries, matcher, index + 1);
      });
  }

  function boxCollectionHandlesForBag(sourceProduct) {
    var title = normalized(sourceProduct.title);
    var smallTypes = ['ring', 'double-ring', 'earring', 'pendant'];
    var largeTypes = ['bracelet', 'necklace', 'watch', 'bangle'];
    var types = smallTypes.concat(largeTypes);
    var seen = {};

    if (/\b(?:mini|gem)\b/.test(title)) {
      types = smallTypes;
    } else if (/\b(?:jewel|cub)\b/.test(title)) {
      types = largeTypes;
    }

    return shuffled(types.map(boxCollectionForType).filter(function (handle) {
      if (!handle || seen[handle]) {
        return false;
      }
      seen[handle] = true;
      return true;
    }));
  }

  function recommendBoxForBag(sourceProduct, sourceVariant, excluded) {
    var collectionHandles = boxCollectionHandlesForBag(sourceProduct);

    return Promise.all(collectionHandles.map(getCollection)).then(function (collections) {
      var sourceFamily = colorFamily(sourceVariant.option1, true);
      var products = [].concat.apply([], collections);
      var seen = {};
      var exact = [];
      var family = [];

      products.forEach(function (product) {
        var exactVariant;
        var familyVariant;

        if (!product.handle || seen[product.handle] || excluded[product.handle] || !isBox(product)) {
          return;
        }
        seen[product.handle] = true;
        exactVariant = variantByExactColor(product, sourceVariant.option1);
        familyVariant = sourceFamily ? variantByFamily(product, sourceFamily, true) : null;

        if (exactVariant) {
          exact.push({ product: product, variant: exactVariant });
        } else if (familyVariant) {
          family.push({ product: product, variant: familyVariant });
        }
      });

      return shuffled(exact)[0] || shuffled(family)[0] || null;
    }).then(function (recommendation) {
      if (recommendation) {
        recommendation.kind = 'box';
        recommendation.reason = 'Coordinating box size and color';
      }
      return recommendation;
    });
  }

  function recommendBox(sourceProduct, sourceVariant, excluded) {
    var term = collectionSearchTerm(sourceProduct);
    var sourceType = productType(sourceProduct);

    if (isBag(sourceProduct)) {
      return recommendBoxForBag(sourceProduct, sourceVariant, excluded);
    }

    if (!isBox(sourceProduct)) {
      var boxCollectionHandle = boxCollectionForType(sourceType);

      if (!boxCollectionHandle) {
        return Promise.resolve(null);
      }

      return getCollection(boxCollectionHandle).then(function (products) {
        var candidates = shuffled(products.filter(function (product) {
          return product.handle && !excluded[product.handle] && isBox(product);
        }));

        return firstMatchingProduct(candidates, function (product) {
          return variantByExactColor(product, sourceVariant.option1);
        }, 0);
      }).then(function (recommendation) {
        if (recommendation) {
          recommendation.kind = 'box';
          recommendation.reason = 'Matching ' + sourceType.replace(/-/g, ' ') + ' box';
        }
        return recommendation;
      });
    }

    if (!term) {
      return Promise.resolve(null);
    }

    return getJSON(
      '/search/suggest.json?q=' + encodeURIComponent(term) +
      '&resources[type]=product&resources[limit]=10&resources[options][unavailable_products]=hide'
    ).then(function (response) {
      var products = (((response || {}).resources || {}).results || {}).products || [];
      var candidates = products.filter(function (product) {
        return product.handle &&
          !excluded[product.handle] &&
          isBox(product) &&
          productType(product) !== sourceType &&
          normalized(product.title).indexOf(normalized(term)) !== -1;
      });

      return firstMatchingProduct(shuffled(candidates), function (product) {
        return variantByExactColor(product, sourceVariant.option1);
      }, 0);
    }).then(function (recommendation) {
      if (recommendation) {
        recommendation.kind = 'box';
        recommendation.reason = 'Same collection and color';
      }
      return recommendation;
    });
  }

  function recommendDisplay(sourceProduct, sourceVariant, excluded) {
    var collectionHandle = displayCollectionForType(productType(sourceProduct));

    if (!collectionHandle) {
      return Promise.resolve(null);
    }

    return getCollection(collectionHandle).then(function (products) {
      var candidates = shuffled(products.filter(function (product) {
        return product.handle && !excluded[product.handle] && isDisplay(product);
      }));
      var preferred = null;
      var fallback = null;

      candidates.some(function (product) {
        var sourceFamily = colorFamily(sourceVariant.option1, false);
        var variant = sourceFamily ?
          variantForColor(product, sourceVariant.option1, false, 'White') :
          variantByExactColor(product, 'White');
        if (!variant) {
          return false;
        }

        if (exactColor(variant.option1, 'White')) {
          fallback = fallback || { product: product, variant: variant };
          return false;
        }

        preferred = { product: product, variant: variant };
        return true;
      });

      return preferred || fallback;
    }).then(function (recommendation) {
      if (recommendation) {
        recommendation.kind = 'display';
        recommendation.reason = 'Matching ' + productType(sourceProduct).replace(/-/g, ' ') + ' display';
      }
      return recommendation;
    });
  }

  function skuNumber(sku) {
    var match = String(sku || '').match(/[a-z]+(\d+)/i);
    return match ? Number(match[1]) : null;
  }

  function bagHasRightSize(product, sourceSku, sourceProduct) {
    var number = skuNumber(sourceSku);
    var title = normalized(product.title);
    var sourceTitle = normalized(sourceProduct && sourceProduct.title);

    if (/\b(?:mini|gem)\b/.test(sourceTitle)) {
      return /\b(?:mini|gem)\b/.test(title);
    }
    if (/\b(?:jewel|cub)\b/.test(sourceTitle)) {
      return /\b(?:jewel|cub)\b/.test(title);
    }

    if (number === null) {
      return true;
    }
    if (number < 40) {
      return /\b(mini|gem)\b/.test(title);
    }

    return /\b(jewel|cub)\b/.test(title);
  }

  function recommendBag(sourceProduct, sourceVariant, excluded) {
    return Promise.all(BAG_COLLECTIONS.map(getCollection)).then(function (collections) {
      var products = [].concat.apply([], collections).filter(function (product) {
        return product.handle && !excluded[product.handle] && isBag(product) &&
          bagHasRightSize(product, sourceVariant.sku, sourceProduct);
      });
      var sourceFamily = colorFamily(sourceVariant.option1, true) || 'black';
      var exact = [];
      var family = [];
      var fallback = [];

      products.forEach(function (product) {
        var exactVariant = variantByExactColor(product, sourceVariant.option1);
        var familyVariant = variantByFamily(product, sourceFamily, true);
        var blackVariant = variantByFamily(product, 'black', true);

        if (exactVariant) {
          exact.push({ product: product, variant: exactVariant });
        } else if (familyVariant) {
          family.push({ product: product, variant: familyVariant });
        } else if (blackVariant) {
          fallback.push({ product: product, variant: blackVariant });
        }
      });

      return shuffled(exact)[0] || shuffled(family)[0] || shuffled(fallback)[0] || null;
    }).then(function (recommendation) {
      if (recommendation) {
        recommendation.kind = 'bag';
        recommendation.reason = 'Coordinating bag size and color';
      }
      return recommendation;
    });
  }

  function giftCandidateFromCollection(handle, sourceVariant, excluded) {
    return getCollection(handle).then(function (products) {
      var candidates = shuffled(products.filter(function (product) {
        return product.handle && !excluded[product.handle];
      }));
      var sourceFamily = colorFamily(sourceVariant.option1, true);
      var isTissueOrRibbon = handle === 'wholesale-tissue-paper' || RIBBON_COLLECTIONS.indexOf(handle) !== -1;
      var isWrapping = handle === 'wrapping-paper';
      var recommendation = null;

      candidates.some(function (product) {
        var variant;

        if (isTissueOrRibbon) {
          variant = variantByExactColor(product, sourceVariant.option1);
          if (!variant && sourceFamily) {
            variant = variantByFamily(product, sourceFamily, true);
          }
        } else if (isWrapping) {
          variant = availableVariants(product).find(function (item) {
            return /gold|silver/.test(normalized(item.option1) + ' ' + normalized(product.title));
          });
        } else {
          variant = availableVariants(product)[0];
        }

        if (variant) {
          recommendation = { product: product, variant: variant };
          return true;
        }
        return false;
      });

      return recommendation;
    }).catch(function () {
      return null;
    });
  }

  function recommendGift(sourceVariant, excluded) {
    var collections = [
      'popular-supplies',
      'wholesale-tissue-paper',
      'wrapping-paper'
    ];

    if (RIBBON_COLLECTIONS.length) {
      collections.push(shuffled(RIBBON_COLLECTIONS)[0]);
    }
    collections = shuffled(collections);

    function tryCollection(index) {
      if (index >= collections.length) {
        return Promise.resolve(null);
      }

      return giftCandidateFromCollection(collections[index], sourceVariant, excluded)
        .then(function (recommendation) {
          return recommendation || tryCollection(index + 1);
        });
    }

    return tryCollection(0).then(function (recommendation) {
      if (recommendation) {
        recommendation.kind = 'gift';
        recommendation.reason = 'Supply or gift packaging';
      }
      return recommendation;
    });
  }

  function escapeHTML(value) {
    return $('<div>').text(value == null ? '' : value).html();
  }

  function formatMoney(cents) {
    if (window.Shopify && typeof window.Shopify.formatMoney === 'function') {
      return window.Shopify.formatMoney(cents);
    }

    return '$' + (Number(cents || 0) / 100).toFixed(2);
  }

  function imageURL(product, variant) {
    var image = variant.featured_image || product.featured_image || (product.images || [])[0] || '';
    return typeof image === 'string' ? image : (image.src || '');
  }

  function recommendationCard(recommendation) {
    var product = recommendation.product;
    var variant = recommendation.variant;
    var href = '/products/' + encodeURIComponent(product.handle) +
      '?variant=' + encodeURIComponent(variant.id) +
      '&utm_source=upsell&utm_medium=atc&utm_campaign=' + encodeURIComponent(variant.sku || '') +
      '&utm_content=dynamic-' + encodeURIComponent(recommendation.kind);

    return '<div class="flex-5 atc-upsell-card" data-recommendation-type="' + escapeHTML(recommendation.kind) + '">' +
      '<a href="' + href + '" class="upsell-item flex" data-upsell-handle="' + escapeHTML(product.handle) + '">' +
        '<div class="upsell-item-image flex-4"><img src="' + escapeHTML(imageURL(product, variant)) + '" width="120" height="120" alt=""/></div>' +
        '<div class="flex-6 flex flex-column flex-justify-between upsell-item-details">' +
          '<div>' +
            '<div class="upsell-item-reason">' + escapeHTML(recommendation.reason) + '</div>' +
            '<div class="upsell-item-title">' + escapeHTML(product.title) + '</div>' +
            '<div class="upsell-item-price">' + escapeHTML(formatMoney(variant.price)) + '</div>' +
          '</div>' +
          '<div><span class="btn btn-small btn-black-dark">View Item</span></div>' +
        '</div>' +
      '</a>' +
    '</div>';
  }

  function recommendationGrid($container) {
    var $grid = $container.find('.atc-upsell-grid').first();

    if (!$grid.length) {
      $container.append(
        '<div class="atc-upsell-content">' +
          '<h4>Recommended Items</h4>' +
          '<div class="flex atc-upsell-grid"></div>' +
        '</div>'
      );
      $grid = $container.find('.atc-upsell-grid').first();
    }

    return $grid;
  }

  function enhance($container, addedItem) {
    var requestToken = String(Date.now()) + String(Math.random());

    $container.find('.atc-upsell-dynamic-status').remove();
    $container.data('dynamic-upsell-request', requestToken);

    return getProduct(addedItem.handle).then(function (sourceProduct) {
      var sourceVariant;
      var excluded;

      if ($container.data('dynamic-upsell-request') !== requestToken) {
        return [];
      }

      if (!isBox(sourceProduct) && !isDisplay(sourceProduct) && !isBag(sourceProduct)) {
        return [];
      }

      sourceVariant = (sourceProduct.variants || []).find(function (variant) {
        return Number(variant.id) === Number(addedItem.variant.id);
      }) || (sourceProduct.variants || []).find(function (variant) {
        return exactColor(variant.option1, addedItem.variant.option1);
      });

      if (!sourceVariant) {
        return [];
      }

      excluded = excludedHandles($container, sourceProduct.handle);
      $container.append('<div class="atc-upsell-dynamic-status">Finding coordinating items...</div>');

      if (isBag(sourceProduct)) {
        return recommendBox(sourceProduct, sourceVariant, excluded).then(function (boxRecommendation) {
          var displayExcluded = {};

          Object.keys(excluded).forEach(function (handle) {
            displayExcluded[handle] = true;
          });
          if (boxRecommendation) {
            displayExcluded[boxRecommendation.product.handle] = true;
          }

          return Promise.all([
            Promise.resolve(boxRecommendation),
            boxRecommendation ?
              recommendDisplay(boxRecommendation.product, boxRecommendation.variant, displayExcluded) :
              Promise.resolve(null),
            recommendBag(sourceProduct, sourceVariant, excluded),
            recommendGift(sourceVariant, excluded)
          ]);
        });
      }

      return Promise.all([
        recommendBox(sourceProduct, sourceVariant, excluded),
        recommendDisplay(sourceProduct, sourceVariant, excluded),
        recommendBag(sourceProduct, sourceVariant, excluded),
        recommendGift(sourceVariant, excluded)
      ]);
    }).then(function (recommendations) {
      var $grid;

      if ($container.data('dynamic-upsell-request') !== requestToken) {
        return;
      }

      $container.find('.atc-upsell-dynamic-status').remove();
      recommendations = (recommendations || []).filter(Boolean).filter(function (recommendation) {
        return !!imageURL(recommendation.product, recommendation.variant);
      });
      if (!recommendations.length) {
        return;
      }

      $grid = recommendationGrid($container);
      recommendations.forEach(function (recommendation) {
        if (!$container.find('[data-upsell-handle="' + recommendation.product.handle + '"]').length) {
          $grid.append(recommendationCard(recommendation));
        }
      });
    }).catch(function (error) {
      if ($container.data('dynamic-upsell-request') !== requestToken) {
        return;
      }

      $container.find('.atc-upsell-dynamic-status').remove();
      if (window.console && typeof window.console.warn === 'function') {
        window.console.warn('Dynamic ATC recommendations were unavailable.', error);
      }
    });
  }

  window.ATCUpsell = {
    enhance: enhance
  };
}(jQuery, window));
